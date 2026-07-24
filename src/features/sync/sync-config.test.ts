import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  isConfigComplete,
  loadSyncConfig,
  saveSyncConfig,
} from "./sync-config";

beforeEach(() => window.localStorage.clear());

describe("persistence", () => {
  it("returns defaults when nothing is stored", () => {
    expect(loadSyncConfig()).toEqual(DEFAULT_CONFIG);
  });

  it("round-trips a saved config", () => {
    const config = {
      token: "ghp_x",
      owner: "yoyold",
      repo: "vault",
      path: "snap.json",
      device: "Laptop",
      encrypt: true,
    };
    saveSyncConfig(config);
    expect(loadSyncConfig()).toEqual(config);
  });

  it("falls back to the default path when it is blank", () => {
    saveSyncConfig({ ...DEFAULT_CONFIG, path: "" });
    expect(loadSyncConfig().path).toBe(DEFAULT_CONFIG.path);
  });

  it("tolerates corrupted storage", () => {
    window.localStorage.setItem("chessvault.sync.config", "{not json");
    expect(loadSyncConfig()).toEqual(DEFAULT_CONFIG);
  });
});

describe("isConfigComplete", () => {
  it("requires a token, owner and repo", () => {
    expect(isConfigComplete(DEFAULT_CONFIG)).toBe(false);
    expect(
      isConfigComplete({ ...DEFAULT_CONFIG, token: "t", owner: "o", repo: "r" }),
    ).toBe(true);
  });

  it("treats whitespace-only values as missing", () => {
    expect(
      isConfigComplete({ ...DEFAULT_CONFIG, token: "  ", owner: "o", repo: "r" }),
    ).toBe(false);
  });
});
