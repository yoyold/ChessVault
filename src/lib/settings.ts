/**
 * User settings, stored in localStorage rather than IndexedDB.
 *
 * They are small, needed synchronously at startup, and read before the database
 * is opened. Keeping them in IndexedDB would make the first paint wait on an
 * asynchronous database handshake. See ADR 0005.
 *
 * Exposed as an external store so React can subscribe with
 * `useSyncExternalStore`: settings are client-only state that does not exist
 * during the static export, and a store with a server snapshot is the idiom
 * that handles that without a mount flag and a cascading render.
 */
export interface AppSettings {
  /**
   * The names the database owner plays under.
   *
   * Several are supported because the same person appears differently across
   * sources — a club name, an online handle, a spelling with or without
   * accents. This is what lets import decide which colour the owner had, which
   * every colour-based filter and statistic depends on.
   */
  playerNames: string[];
}

/**
 * Frozen so the reference is stable: `useSyncExternalStore` compares snapshots
 * by identity and would loop forever on a fresh object each call.
 */
export const DEFAULT_SETTINGS: Readonly<AppSettings> = Object.freeze({
  playerNames: Object.freeze([]) as unknown as string[],
});

const STORAGE_KEY = "chessvault.settings";

let cache: AppSettings | null = null;
const listeners = new Set<() => void>();

function parse(raw: string | null): AppSettings {
  if (!raw) return DEFAULT_SETTINGS;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_SETTINGS;

    const stored = parsed as Partial<AppSettings>;

    return {
      playerNames: Array.isArray(stored.playerNames)
        ? stored.playerNames.filter((name): name is string => typeof name === "string")
        : DEFAULT_SETTINGS.playerNames,
    };
  } catch {
    // Settings are a convenience: corrupted or hand-edited storage must never
    // prevent the application from starting.
    return DEFAULT_SETTINGS;
  }
}

function notify() {
  for (const listener of listeners) listener();
}

/** Invalidate the cache when another tab writes settings, then re-render. */
function handleStorageEvent(event: StorageEvent) {
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  cache = null;
  notify();
}

/**
 * Current settings.
 *
 * The result is cached so repeated calls return an identical reference, which
 * `useSyncExternalStore` requires.
 */
export function getSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  cache ??= parse(window.localStorage.getItem(STORAGE_KEY));

  return cache;
}

/** Settings as they appear during static rendering, where no storage exists. */
export function getServerSettings(): AppSettings {
  return DEFAULT_SETTINGS;
}

export function subscribeToSettings(listener: () => void): () => void {
  listeners.add(listener);

  if (listeners.size === 1 && typeof window !== "undefined") {
    window.addEventListener("storage", handleStorageEvent);
  }

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorageEvent);
    }
  };
}

/** Merge a patch into stored settings, persist it and notify subscribers. */
export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next: AppSettings = { ...getSettings(), ...patch };
  cache = next;

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  notify();

  return next;
}

/** Discard the cached snapshot. Intended for tests. */
export function resetSettingsCache(): void {
  cache = null;
}
