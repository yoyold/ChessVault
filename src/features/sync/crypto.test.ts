import { describe, expect, it } from "vitest";
import { decrypt, DecryptionError, encrypt, isEncrypted } from "./crypto";

describe("encrypt / decrypt", () => {
  it("round-trips a snapshot string", async () => {
    const plaintext = JSON.stringify({ format: 1, data: { games: ["a", "b"] } });

    const envelope = await encrypt(plaintext, "correct horse");
    expect(await decrypt(envelope, "correct horse")).toBe(plaintext);
  });

  it("does not reveal the plaintext in the envelope", async () => {
    const envelope = await encrypt("Dony, Lukas plays the Sicilian", "pw");
    expect(envelope).not.toContain("Sicilian");
    expect(envelope).not.toContain("Dony");
  });

  it("produces different output each time for the same input", async () => {
    // A fresh salt and IV per encryption; identical output would leak that two
    // snapshots are the same.
    const [a, b] = await Promise.all([encrypt("same", "pw"), encrypt("same", "pw")]);
    expect(a).not.toBe(b);
  });

  it("handles a large payload without overflowing", async () => {
    // Real snapshots are megabytes; the base64 step must chunk.
    const big = "x".repeat(2_000_000);
    const envelope = await encrypt(big, "pw");
    expect(await decrypt(envelope, "pw")).toBe(big);
  });

  it("preserves non-ASCII content", async () => {
    const text = "Klein, Jörg — Đurić, Živko ½–½";
    const envelope = await encrypt(text, "pw");
    expect(await decrypt(envelope, "pw")).toBe(text);
  });
});

describe("wrong passphrase", () => {
  it("fails to decrypt rather than returning garbage", async () => {
    const envelope = await encrypt("secret", "right");
    await expect(decrypt(envelope, "wrong")).rejects.toBeInstanceOf(DecryptionError);
  });

  it("rejects tampered ciphertext", async () => {
    // AES-GCM authenticates, so altering a byte must fail, not silently corrupt.
    const envelope = JSON.parse(await encrypt("secret", "pw"));
    envelope.ciphertext = "AAAA" + envelope.ciphertext.slice(4);

    await expect(decrypt(JSON.stringify(envelope), "pw")).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("rejects a non-envelope string", async () => {
    await expect(decrypt("not json", "pw")).rejects.toBeInstanceOf(DecryptionError);
  });
});

describe("isEncrypted", () => {
  it("recognises an encrypted envelope", async () => {
    expect(isEncrypted(await encrypt("x", "pw"))).toBe(true);
  });

  it("recognises a plain snapshot as not encrypted", () => {
    expect(isEncrypted(JSON.stringify({ format: 1, data: {} }))).toBe(false);
  });

  it("treats non-JSON as not encrypted", () => {
    expect(isEncrypted("plain text")).toBe(false);
  });
});
