/**
 * Client-side encryption for snapshots.
 *
 * A private repository already limits who can read a snapshot, but encrypting
 * before upload means the storage provider cannot read it either: the data
 * never leaves the device in the clear. The key never leaves the device — it is
 * derived from a passphrase the user keeps, so losing the passphrase means
 * losing the ability to restore, by design.
 *
 * AES-GCM is authenticated, so a wrong passphrase or tampered data fails to
 * decrypt rather than returning garbage — which is what lets a wrong passphrase
 * be reported as such.
 */

/**
 * PBKDF2 work factor.
 *
 * A balance for a personal app running on the main thread: high enough to make
 * a stolen snapshot expensive to attack offline, low enough not to freeze the
 * tab. Recorded in the envelope so it can be raised later without breaking old
 * snapshots.
 */
const PBKDF2_ITERATIONS = 210_000;

interface EncryptedEnvelope {
  kdf: "PBKDF2";
  hash: "SHA-256";
  iterations: number;
  /** Base64. Fresh per encryption, so the same input never yields the same output. */
  salt: string;
  iv: string;
  ciphertext: string;
}

/** Raised when decryption fails, which almost always means a wrong passphrase. */
export class DecryptionError extends Error {
  constructor() {
    super("Wrong passphrase, or the snapshot is corrupted.");
    this.name = "DecryptionError";
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Base64 in chunks.
 *
 * Snapshots run to megabytes, and spreading a multi-megabyte array into
 * `String.fromCharCode(...bytes)` overflows the call stack. Chunking keeps each
 * call small.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase) as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypt a snapshot string with a passphrase, returning a JSON envelope. */
export async function encrypt(plaintext: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      encoder.encode(plaintext) as BufferSource,
    ),
  );

  const envelope: EncryptedEnvelope = {
    kdf: "PBKDF2",
    hash: "SHA-256",
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
  };

  return JSON.stringify(envelope);
}

/**
 * Decrypt an envelope produced by {@link encrypt}.
 *
 * @throws DecryptionError if the passphrase is wrong or the data is corrupted.
 */
export async function decrypt(envelopeJson: string, passphrase: string): Promise<string> {
  let envelope: EncryptedEnvelope;

  try {
    envelope = JSON.parse(envelopeJson) as EncryptedEnvelope;
  } catch {
    throw new DecryptionError();
  }

  const key = await deriveKey(
    passphrase,
    base64ToBytes(envelope.salt),
    envelope.iterations,
  );

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(envelope.iv) as BufferSource },
      key,
      base64ToBytes(envelope.ciphertext) as BufferSource,
    );

    return decoder.decode(plaintext);
  } catch {
    // AES-GCM authentication failed: the wrong key, or altered ciphertext.
    throw new DecryptionError();
  }
}

/**
 * Whether stored content is an encrypted envelope rather than a plain snapshot.
 *
 * Lets a pull decide whether a passphrase is needed without the user having to
 * declare in advance whether a given remote is encrypted.
 */
export function isEncrypted(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as Partial<EncryptedEnvelope>;
    return parsed.kdf === "PBKDF2" && typeof parsed.ciphertext === "string";
  } catch {
    return false;
  }
}
