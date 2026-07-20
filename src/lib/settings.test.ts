import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  getServerSettings,
  getSettings,
  resetSettingsCache,
  saveSettings,
  subscribeToSettings,
} from "./settings";

const STORAGE_KEY = "chessvault.settings";

beforeEach(() => {
  window.localStorage.clear();
  resetSettingsCache();
});

describe("getSettings", () => {
  it("returns defaults when nothing is stored", () => {
    expect(getSettings()).toEqual({ playerNames: [] });
  });

  it("returns a stable reference across calls", () => {
    // useSyncExternalStore compares snapshots by identity; a fresh object per
    // call would re-render forever.
    saveSettings({ playerNames: ["A"] });
    expect(getSettings()).toBe(getSettings());
  });

  it("reads stored settings", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ playerNames: ["Carlsen, Magnus"] }),
    );
    expect(getSettings().playerNames).toEqual(["Carlsen, Magnus"]);
  });

  describe("tolerating damaged storage", () => {
    // Settings are a convenience. Losing them must never stop the app starting.
    it("falls back on invalid JSON", () => {
      window.localStorage.setItem(STORAGE_KEY, "{not json");
      expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    });

    it("falls back on a non-object payload", () => {
      window.localStorage.setItem(STORAGE_KEY, '"a string"');
      expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    });

    it("drops entries of the wrong type", () => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ playerNames: ["ok", 42, null] }),
      );
      expect(getSettings().playerNames).toEqual(["ok"]);
    });
  });
});

describe("saveSettings", () => {
  it("persists and returns the merged result", () => {
    const result = saveSettings({ playerNames: ["A"] });

    expect(result.playerNames).toEqual(["A"]);
    expect(getSettings().playerNames).toEqual(["A"]);

    resetSettingsCache();
    expect(getSettings().playerNames).toEqual(["A"]);
  });

  it("notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToSettings(listener);

    saveSettings({ playerNames: ["A"] });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    saveSettings({ playerNames: ["B"] });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("cross-tab synchronisation", () => {
  it("picks up a write from another tab", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToSettings(listener);

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ playerNames: ["From other tab"] }),
    );
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));

    expect(listener).toHaveBeenCalled();
    expect(getSettings().playerNames).toEqual(["From other tab"]);

    unsubscribe();
  });

  it("ignores storage events for unrelated keys", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToSettings(listener);

    window.dispatchEvent(new StorageEvent("storage", { key: "something.else" }));

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe("getServerSettings", () => {
  it("returns the frozen defaults", () => {
    // Must be referentially stable for the server snapshot.
    expect(getServerSettings()).toBe(getServerSettings());
    expect(getServerSettings()).toEqual({ playerNames: [] });
  });
});
