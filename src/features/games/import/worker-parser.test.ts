import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/persistence/db";
import {
  indexerWithFallback,
  indexGames,
  inlineIndexer,
  inlineParser,
  withFallback,
} from "./batch-parser";
import { importPgn } from "./import-games";
import { fakeImportWorker as fakeWorker } from "./fake-import-worker";
import { workerIndexer, workerParser } from "./worker-parser";

const FILE = [
  '[Event "A"]\n[White "Me"]\n[Black "Opp"]\n[Result "1-0"]\n\n1. e4 e5 1-0',
  '[Event "Broken"]\n[White "Me"]\n[Black "Opp"]\n\n1. e5 *',
  '[Event "B"]\n[White "Opp"]\n[Black "Me"]\n[Result "0-1"]\n\n1. d4 d5 0-1',
].join("\n\n");

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe("workerParser", () => {
  it("imports through the worker exactly as on the page", async () => {
    const worker = fakeWorker();

    const result = await importPgn(FILE, {
      ownerNames: ["Me"],
      batchSize: 2,
      parser: workerParser(() => worker),
    });

    expect(result).toMatchObject({ total: 3, imported: 2, duplicates: 0 });
    expect(result.failures).toEqual([expect.objectContaining({ gameNumber: 2 })]);
    expect(await db.gamePositions.count()).toBe(6);
    expect((await db.games.toArray()).map((game) => game.playerColor)).toEqual(["white", "black"]);
  });

  it("stops the worker when the import ends", async () => {
    const worker = fakeWorker();

    await importPgn(FILE, { ownerNames: ["Me"], parser: workerParser(() => worker) });

    expect(worker.terminated).toBe(true);
  });

  it("fails the import, rather than hanging, when the worker dies", async () => {
    const worker = fakeWorker();
    worker.crash("Script failed to load");

    await expect(
      importPgn(FILE, { ownerNames: ["Me"], parser: workerParser(() => worker) }),
    ).rejects.toThrow("Script failed to load");
    expect(worker.terminated).toBe(true);
    expect(await db.games.count()).toBe(0);
  });
});

describe("withFallback", () => {
  it("parses on the page when the worker cannot start", async () => {
    const result = await importPgn(FILE, {
      ownerNames: ["Me"],
      parser: withFallback(() => {
        throw new Error("Workers are not available");
      }, inlineParser),
    });

    expect(result).toMatchObject({ total: 3, imported: 2 });
  });

  it("parses on the page when the worker fails to load", async () => {
    const worker = fakeWorker();
    worker.crash("Script failed to load");

    const result = await importPgn(FILE, {
      ownerNames: ["Me"],
      parser: withFallback(() => workerParser(() => worker), inlineParser),
    });

    expect(result).toMatchObject({ total: 3, imported: 2 });
    expect(worker.terminated).toBe(true);
  });

  it("keeps to the worker when it works", async () => {
    let fellBack = false;

    await importPgn(FILE, {
      ownerNames: ["Me"],
      parser: withFallback(
        () => workerParser(fakeWorker),
        () => {
          fellBack = true;
          return inlineParser();
        },
      ),
    });

    expect(fellBack).toBe(false);
  });
});

describe("indexing stored games", () => {
  const GAMES = [
    { gameId: 7, pgn: '[Event "A"]\n\n1. e4 e5 *' },
    { gameId: 8, pgn: '[Event "Broken"]\n\n1. e5 *' },
  ];

  it("finds each game's positions, and none for one it cannot read", () => {
    expect(indexGames(GAMES).map((game) => [game.gameId, game.positions.length])).toEqual([
      [7, 3],
      [8, 0],
    ]);
  });

  it("gives the same answer through the worker", async () => {
    const indexer = workerIndexer(fakeWorker);

    expect(await indexer.index(GAMES)).toEqual(indexGames(GAMES));
    indexer.close();
  });

  it("carries on on the page when the worker fails part way", async () => {
    const worker = fakeWorker();
    const indexer = indexerWithFallback(() => workerIndexer(() => worker), inlineIndexer);

    expect(await indexer.index(GAMES.slice(0, 1))).toHaveLength(1);
    worker.crash("Out of memory");
    expect(await indexer.index(GAMES)).toEqual(indexGames(GAMES));
    expect(worker.terminated).toBe(true);
  });
});
