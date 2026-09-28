import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPersistenceState,
  getStorageUsage,
  requestPersistence,
} from "./storage-persistence";

function stubStorage(storage: Partial<StorageManager> | undefined) {
  vi.stubGlobal("navigator", { ...navigator, storage });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getPersistenceState", () => {
  it("reports persistent storage", async () => {
    stubStorage({ persisted: async () => true });
    expect(await getPersistenceState()).toBe("persistent");
  });

  it("reports storage the browser may clear", async () => {
    stubStorage({ persisted: async () => false });
    expect(await getPersistenceState()).toBe("best-effort");
  });

  it("reports a browser without the API as unsupported, not as an error", async () => {
    stubStorage(undefined);
    expect(await getPersistenceState()).toBe("unsupported");
  });

  it("treats a browser that throws as unsupported", async () => {
    stubStorage({
      persisted: async () => {
        throw new Error("not allowed in this context");
      },
    });
    expect(await getPersistenceState()).toBe("unsupported");
  });
});

describe("requestPersistence", () => {
  it("reports a granted request", async () => {
    stubStorage({ persist: async () => true });
    expect(await requestPersistence()).toBe("persistent");
  });

  it("reports a declined request as best effort", async () => {
    // Chrome declines silently when the site is not used much; that is normal.
    stubStorage({ persist: async () => false });
    expect(await requestPersistence()).toBe("best-effort");
  });

  it("does nothing where the API is missing", async () => {
    stubStorage({});
    expect(await requestPersistence()).toBe("unsupported");
  });
});

describe("getStorageUsage", () => {
  it("reports usage and quota", async () => {
    stubStorage({ estimate: async () => ({ usage: 1_200_000, quota: 2_000_000_000 }) });
    expect(await getStorageUsage()).toEqual({ usage: 1_200_000, quota: 2_000_000_000 });
  });

  it("says nothing rather than guessing when the browser withholds a figure", async () => {
    stubStorage({ estimate: async () => ({ usage: 5 }) });
    expect(await getStorageUsage()).toBeNull();
  });
});
