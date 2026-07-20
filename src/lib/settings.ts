/**
 * User settings, stored in localStorage rather than IndexedDB.
 *
 * They are small, needed synchronously at startup, and read before the database
 * is opened. Keeping them in IndexedDB would make the first paint wait on an
 * asynchronous database handshake. See ADR 0005.
 */
export interface AppSettings {
  /**
   * The names the database owner plays under.
   *
   * Several are supported because the same person appears differently across
   * sources — a club name, an online handle, a maiden name. This is what lets
   * import decide which colour the owner had, which every colour-based filter
   * and statistic depends on.
   */
  playerNames: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  playerNames: [],
};

const STORAGE_KEY = "chessvault.settings";

/**
 * Read settings, falling back to defaults.
 *
 * Safe to call during static prerendering, where there is no localStorage, and
 * tolerant of corrupted or hand-edited storage: settings are a convenience, and
 * losing them must never prevent the application from starting.
 */
export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return { ...DEFAULT_SETTINGS };
    }

    const stored = parsed as Partial<AppSettings>;

    return {
      playerNames: Array.isArray(stored.playerNames)
        ? stored.playerNames.filter((name): name is string => typeof name === "string")
        : DEFAULT_SETTINGS.playerNames,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Merge a patch into stored settings and return the result. */
export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...loadSettings(), ...patch };

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  return next;
}
