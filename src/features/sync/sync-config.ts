/**
 * Persisted sync configuration.
 *
 * The token is stored here in localStorage because there is nowhere else on a
 * static site to keep it, and a fine-grained token scoped to a single repo is a
 * proportionate secret to hold. The **passphrase is deliberately never stored**:
 * it is the encryption key, and keeping it next to the ciphertext's location
 * would defeat the encryption. It is entered per session instead.
 */
export interface SyncConfig {
  token: string;
  owner: string;
  repo: string;
  path: string;
  /** Label written into snapshots, so a conflict can name the source device. */
  device: string;
  /** Whether snapshots are encrypted before upload. */
  encrypt: boolean;
}

const STORAGE_KEY = "chessvault.sync.config";

export const DEFAULT_CONFIG: SyncConfig = {
  token: "",
  owner: "",
  repo: "",
  path: "chessvault-snapshot.json",
  device: "",
  encrypt: true,
};

export function loadSyncConfig(): SyncConfig {
  if (typeof window === "undefined") return { ...DEFAULT_CONFIG };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };

    const parsed = JSON.parse(raw) as Partial<SyncConfig>;
    return {
      token: str(parsed.token),
      owner: str(parsed.owner),
      repo: str(parsed.repo),
      path: str(parsed.path) || DEFAULT_CONFIG.path,
      device: str(parsed.device),
      encrypt: parsed.encrypt !== false,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveSyncConfig(config: SyncConfig): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }
}

/** Whether the config has everything a sync needs. */
export function isConfigComplete(config: SyncConfig): boolean {
  return (
    config.token.trim() !== "" &&
    config.owner.trim() !== "" &&
    config.repo.trim() !== ""
  );
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}
