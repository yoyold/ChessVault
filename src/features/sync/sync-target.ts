/**
 * A place a snapshot can be stored and retrieved, from the app's point of view.
 *
 * The seam that keeps the storage provider swappable, in the same spirit as the
 * engine port (ADR 0002): the shipped adapter talks to a private GitHub
 * repository, but the orchestration above knows only this interface, so a
 * Dropbox or Drive adapter can be added without touching it.
 *
 * The `version` is opaque to the app — for GitHub it is the file's blob SHA —
 * and exists only so a push can detect that another device wrote in the
 * meantime, rather than silently overwriting it.
 */
export interface RemoteSnapshot {
  content: string;
  version: string;
}

export interface SyncTarget {
  /** The stored snapshot, or null if the target holds nothing yet. */
  pull(): Promise<RemoteSnapshot | null>;

  /**
   * Store a snapshot.
   *
   * @param expectedVersion The version a previous pull returned, or null when
   *   writing for the first time. If the remote has advanced past it, the write
   *   is refused with {@link SyncConflictError} instead of clobbering it.
   * @returns The new version.
   */
  push(content: string, expectedVersion: string | null): Promise<string>;
}

/** The remote advanced since the last pull; another device wrote first. */
export class SyncConflictError extends Error {
  constructor() {
    super("The cloud copy changed since you last synced.");
    this.name = "SyncConflictError";
  }
}

/** The credentials were rejected, or lack access to the target. */
export class SyncAuthError extends Error {
  constructor(message = "The sync credentials were rejected.") {
    super(message);
    this.name = "SyncAuthError";
  }
}

/** Any other failure reaching or using the target. */
export class SyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncError";
  }
}
