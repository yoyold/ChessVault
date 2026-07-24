import { decrypt, encrypt, isEncrypted } from "./crypto";
import { createSnapshot, restoreSnapshot, SnapshotError } from "./snapshot";
import { SyncConflictError, type SyncTarget } from "./sync-target";

/**
 * What this device last saw of the remote.
 *
 * The version is the token a push must present to prove it is replacing the
 * copy it thinks is there; without it, two devices would overwrite each other
 * blindly. Kept in localStorage rather than IndexedDB so a database restore —
 * which clears IndexedDB — does not also wipe the sync bookmark.
 */
export interface SyncState {
  lastVersion: string | null;
  lastSyncedAt: number | null;
}

const SYNC_STATE_KEY = "chessvault.sync";
const EMPTY_STATE: SyncState = { lastVersion: null, lastSyncedAt: null };

export function getSyncState(): SyncState {
  if (typeof window === "undefined") return EMPTY_STATE;

  try {
    const raw = window.localStorage.getItem(SYNC_STATE_KEY);
    if (!raw) return EMPTY_STATE;

    const parsed = JSON.parse(raw) as Partial<SyncState>;
    return {
      lastVersion: typeof parsed.lastVersion === "string" ? parsed.lastVersion : null,
      lastSyncedAt: typeof parsed.lastSyncedAt === "number" ? parsed.lastSyncedAt : null,
    };
  } catch {
    return EMPTY_STATE;
  }
}

function setSyncState(state: SyncState): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state));
  }
}

/** Forget the remote bookmark, so the next push is treated as a first write. */
export function resetSyncState(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(SYNC_STATE_KEY);
}

/** The remote holds an encrypted snapshot but no passphrase was supplied. */
export class PassphraseRequiredError extends Error {
  constructor() {
    super("This cloud snapshot is encrypted. Enter its passphrase to restore it.");
    this.name = "PassphraseRequiredError";
  }
}

export interface PushOptions {
  /** Label recorded in the snapshot, so a conflict can name the source device. */
  device: string;
  /** When set, the snapshot is encrypted before upload. */
  passphrase?: string;
  /**
   * Overwrite the remote even if it advanced since the last pull.
   *
   * The deliberate "my copy wins" choice a user makes after being shown a
   * conflict, so it is never the silent default.
   */
  force?: boolean;
}

/**
 * Upload this device's database as a snapshot.
 *
 * @throws SyncConflictError if the remote advanced and `force` was not set.
 */
export async function pushSnapshot(
  target: SyncTarget,
  options: PushOptions,
): Promise<SyncState> {
  const snapshot = await createSnapshot(options.device);
  const json = JSON.stringify(snapshot);
  const content = options.passphrase ? await encrypt(json, options.passphrase) : json;

  const expected = getSyncState().lastVersion;

  try {
    return commit(await target.push(content, expected));
  } catch (error) {
    if (!(options.force && error instanceof SyncConflictError)) throw error;

    // Adopt the remote's current version and overwrite it. A second conflict in
    // this window is genuinely concurrent and is left to surface.
    const remote = await target.pull();
    return commit(await target.push(content, remote?.version ?? null));
  }

  function commit(version: string): SyncState {
    const state: SyncState = { lastVersion: version, lastSyncedAt: Date.now() };
    setSyncState(state);
    return state;
  }
}

export type PullResult =
  | { outcome: "empty" }
  | { outcome: "restored"; state: SyncState };

/**
 * Replace this device's database with the snapshot stored remotely.
 *
 * @throws PassphraseRequiredError if the snapshot is encrypted and no passphrase
 *   was given, DecryptionError if the passphrase is wrong, or SnapshotError if
 *   the snapshot is incompatible.
 */
export async function pullSnapshot(
  target: SyncTarget,
  passphrase?: string,
): Promise<PullResult> {
  const remote = await target.pull();
  if (!remote) return { outcome: "empty" };

  let json = remote.content;

  if (isEncrypted(json)) {
    if (!passphrase) throw new PassphraseRequiredError();
    json = await decrypt(json, passphrase);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new SnapshotError("The cloud snapshot could not be read.");
  }

  // Validates and replaces the database atomically; a bad snapshot changes
  // nothing on this device.
  await restoreSnapshot(parsed);

  const state: SyncState = { lastVersion: remote.version, lastSyncedAt: Date.now() };
  setSyncState(state);
  return { outcome: "restored", state };
}
