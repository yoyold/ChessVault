/**
 * Whether the browser may clear this site's data on its own.
 *
 * By default everything the app stores is "best effort": the browser is free
 * to evict it under storage pressure, and Safari deletes the storage of sites
 * that have not been used for seven days unless they were added to the home
 * screen. For an application whose only copy of the data lives in the
 * browser, that is the difference between a database and a cache.
 *
 * Asking for persistence changes it to "persistent", which the browser will not
 * clear without the user doing it. Whether the request is granted is the
 * browser's decision: Chrome decides silently from how the site is used,
 * Firefox asks the user, Safari grants it to installed apps. A refusal is
 * normal and not an error, and a backup file is the answer either way.
 */
export type PersistenceState = "persistent" | "best-effort" | "unsupported";

function storageManager(): StorageManager | null {
  if (typeof navigator === "undefined") return null;
  return navigator.storage ?? null;
}

export async function getPersistenceState(): Promise<PersistenceState> {
  const storage = storageManager();
  if (!storage?.persisted) return "unsupported";

  try {
    return (await storage.persisted()) ? "persistent" : "best-effort";
  } catch {
    return "unsupported";
  }
}

/**
 * Ask the browser to keep this site's data.
 *
 * Returns the state afterwards rather than the raw answer, so a caller showing
 * it needs no second round trip — and so a browser that throws instead of
 * answering reads as unsupported rather than as a failure to handle.
 */
export async function requestPersistence(): Promise<PersistenceState> {
  const storage = storageManager();
  if (!storage?.persist) return "unsupported";

  try {
    return (await storage.persist()) ? "persistent" : "best-effort";
  } catch {
    return "unsupported";
  }
}

export interface StorageUsage {
  /** Bytes this site is using. */
  usage: number;
  /** Bytes the browser will let it use. */
  quota: number;
}

/** How much space the database takes, or null where the browser will not say. */
export async function getStorageUsage(): Promise<StorageUsage | null> {
  const storage = storageManager();
  if (!storage?.estimate) return null;

  try {
    const { usage, quota } = await storage.estimate();
    return usage === undefined || quota === undefined ? null : { usage, quota };
  } catch {
    return null;
  }
}
