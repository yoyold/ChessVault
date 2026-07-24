import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/persistence/db";
import { importPgn } from "@/features/games/import/import-games";
import { resetSettingsCache } from "@/lib/settings";
import { DecryptionError, isEncrypted } from "./crypto";
import { SnapshotError } from "./snapshot";
import {
  SyncConflictError,
  type RemoteSnapshot,
  type SyncTarget,
} from "./sync-target";
import {
  getSyncState,
  PassphraseRequiredError,
  pullSnapshot,
  pushSnapshot,
  resetSyncState,
} from "./sync-service";

const GAME_A = '[Event "A"]\n[White "Dony, Lukas"]\n[Black "Opp"]\n[Result "1-0"]\n\n1.e4 e5 1-0';
const GAME_B = '[Event "B"]\n[White "X"]\n[Black "Y"]\n[Result "0-1"]\n\n1.d4 d5 0-1';

/** In-memory target with the same version semantics as the GitHub adapter. */
class MemoryTarget implements SyncTarget {
  store: RemoteSnapshot | null = null;
  private counter = 0;

  async pull(): Promise<RemoteSnapshot | null> {
    return this.store ? { ...this.store } : null;
  }

  async push(content: string, expectedVersion: string | null): Promise<string> {
    const current = this.store?.version ?? null;
    if (expectedVersion !== current) throw new SyncConflictError();

    this.counter += 1;
    this.store = { content, version: `v${this.counter}` };
    return this.store.version;
  }

  /** Simulate another device writing, bypassing our optimistic-concurrency check. */
  writeExternally(content: string): void {
    this.counter += 1;
    this.store = { content, version: `v${this.counter}` };
  }
}

async function clearAll() {
  await Promise.all([
    db.games.clear(),
    db.gameContents.clear(),
    db.positions.clear(),
    db.gamePositions.clear(),
    db.evaluations.clear(),
  ]);
}

let remote: MemoryTarget;

beforeEach(async () => {
  await db.open();
  await clearAll();
  window.localStorage.clear();
  resetSettingsCache();
  resetSyncState();
  remote = new MemoryTarget();
});

describe("push then pull round trip", () => {
  it("carries the database between devices", async () => {
    await importPgn(`${GAME_A}\n\n${GAME_B}`, { ownerNames: ["Dony, Lukas"] });

    await pushSnapshot(remote, { device: "Laptop" });

    // A second device: empty, then pulls.
    await clearAll();
    expect(await db.games.count()).toBe(0);

    const result = await pullSnapshot(remote);
    expect(result.outcome).toBe("restored");
    expect(await db.games.count()).toBe(2);
  });

  it("records the version and time after a push", async () => {
    await pushSnapshot(remote, { device: "Laptop" });

    const state = getSyncState();
    expect(state.lastVersion).toBe("v1");
    expect(state.lastSyncedAt).toBeGreaterThan(0);
  });

  it("reports an empty remote rather than failing", async () => {
    expect(await pullSnapshot(remote)).toEqual({ outcome: "empty" });
  });
});

describe("encryption", () => {
  it("stores an encrypted snapshot the storage cannot read", async () => {
    await importPgn(GAME_A, { ownerNames: ["Dony, Lukas"] });
    await pushSnapshot(remote, { device: "Laptop", passphrase: "hunter2" });

    // The stored content is an encrypted envelope, not the snapshot: none of the
    // distinctive plaintext survives. (A two-character token like a move would
    // collide with base64 by chance, so the assertions use longer strings.)
    expect(isEncrypted(remote.store?.content ?? "")).toBe(true);
    expect(remote.store?.content).not.toContain("Dony");
    expect(remote.store?.content).not.toContain("Event");
  });

  it("restores an encrypted snapshot with the right passphrase", async () => {
    await importPgn(GAME_A, { ownerNames: ["Dony, Lukas"] });
    await pushSnapshot(remote, { device: "Laptop", passphrase: "hunter2" });

    await clearAll();
    await pullSnapshot(remote, "hunter2");
    expect(await db.games.count()).toBe(1);
  });

  it("asks for a passphrase when the remote is encrypted and none is given", async () => {
    await pushSnapshot(remote, { device: "Laptop", passphrase: "hunter2" });

    await expect(pullSnapshot(remote)).rejects.toBeInstanceOf(PassphraseRequiredError);
  });

  it("fails on the wrong passphrase", async () => {
    await pushSnapshot(remote, { device: "Laptop", passphrase: "hunter2" });

    await expect(pullSnapshot(remote, "wrong")).rejects.toBeInstanceOf(DecryptionError);
  });
});

describe("conflict handling", () => {
  it("refuses to overwrite a remote that advanced since the last sync", async () => {
    await pushSnapshot(remote, { device: "Laptop" });

    // Another device writes.
    remote.writeExternally("something else");

    await expect(pushSnapshot(remote, { device: "Laptop" })).rejects.toBeInstanceOf(
      SyncConflictError,
    );
  });

  it("overwrites when forced, after the user has chosen to", async () => {
    await importPgn(GAME_A, { ownerNames: ["Dony, Lukas"] });
    await pushSnapshot(remote, { device: "Laptop" });

    remote.writeExternally("something else");

    const state = await pushSnapshot(remote, { device: "Laptop", force: true });
    expect(state.lastVersion).toBe(remote.store?.version);
    // The forced push carries this device's data, not the intruder's.
    expect(remote.store?.content).toContain("Dony");
  });
});

describe("rejecting an incompatible remote", () => {
  it("surfaces a schema mismatch without changing the database", async () => {
    await importPgn(GAME_A, { ownerNames: ["Dony, Lukas"] });
    const before = await db.games.count();

    remote.writeExternally(
      JSON.stringify({ format: 1, schemaVersion: 999, data: {}, settings: { playerNames: [] } }),
    );

    await expect(pullSnapshot(remote)).rejects.toBeInstanceOf(SnapshotError);
    expect(await db.games.count()).toBe(before);
  });
});
