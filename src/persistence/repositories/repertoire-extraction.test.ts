import { beforeEach, describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { db } from "@/persistence/db";
import { positionKey } from "@/core/chess/position-key";
import type { Color, GameRecord, GameResult } from "@/core/domain/game";
import { REPERTOIRE_ROOT } from "@/core/domain/repertoire";
import { orphanedMoves } from "@/core/repertoire/repertoire-graph";
import { getRepertoire } from "./repertoire-repository";
import {
  adoptCandidates,
  extractRepertoireCandidates,
} from "./repertoire-extraction";

/**
 * Write a game and its positions straight to the tables.
 *
 * Deliberately not routed through the import pipeline: that lives a layer above
 * persistence, and extraction reads only what is stored, so seeding the stored
 * shape keeps this test independent of how the rows got there.
 */
async function seedGame(
  playerColor: Color | null,
  result: GameResult,
  ...sanMoves: string[]
) {
  const board = new Chess();
  const positions: { key: ReturnType<typeof positionKey>; san: string | null }[] = [
    { key: positionKey(board), san: null },
  ];

  for (const san of sanMoves) {
    const move = board.move(san);
    positions.push({ key: positionKey(board), san: move.san });
  }

  const record: GameRecord = {
    contentHash: Math.random().toString(16),
    white: playerColor === "black" ? "Opponent" : "Dony, Lukas",
    black: playerColor === "black" ? "Dony, Lukas" : "Opponent",
    result,
    dateIso: "2024-01-01",
    event: "Test",
    site: null,
    round: null,
    eco: null,
    opening: null,
    timeControl: null,
    playerColor,
    whiteElo: null,
    blackElo: null,
    opponent: playerColor ? "Opponent" : null,
    opponentElo: null,
    playerElo: null,
    tags: [],
    notes: "",
    plyCount: sanMoves.length,
    finalFen: board.fen(),
    searchTokens: [],
    importedAt: 1,
    updatedAt: 1,
  };

  const id = (await db.games.add(record)) as number;

  await db.gamePositions.bulkAdd(
    positions.map((position, ply) => ({
      gameId: id,
      ply,
      key: position.key,
      san: position.san,
    })),
  );
}

beforeEach(async () => {
  await db.open();
  await Promise.all([
    db.games.clear(),
    db.gamePositions.clear(),
    db.repertoireMoves.clear(),
  ]);
});

describe("extractRepertoireCandidates", () => {
  it("aggregates the openings actually played", async () => {
    await seedGame("white", "1-0", "e4", "e5", "Nf3");
    await seedGame("white", "0-1", "e4", "c5", "Nf3");
    await seedGame("white", "1-0", "d4", "d5");

    const candidates = await extractRepertoireCandidates({ color: "white" });
    const e4 = candidates.find((c) => c.san === "e4");

    expect(e4?.played).toBe(2);
    expect(e4?.score).toBe(0.5);
    expect(candidates.find((c) => c.san === "d4")?.played).toBe(1);
  });

  it("reads the moves from the position table, not by reparsing", async () => {
    // The positions were extracted once at import; extraction reuses them, so
    // the stored rows are all it needs.
    await seedGame("white", "1-0", "e4", "e5");

    expect(await db.gamePositions.count()).toBe(3);
    expect(await extractRepertoireCandidates({ color: "white" })).toHaveLength(2);
  });

  it("returns only the requested colour", async () => {
    await seedGame("white", "1-0", "e4", "e5");
    await seedGame("black", "0-1", "d4", "d5");

    const asWhite = await extractRepertoireCandidates({ color: "white" });
    const asBlack = await extractRepertoireCandidates({ color: "black" });

    expect(asWhite.every((c) => c.color === "white")).toBe(true);
    expect(asWhite.map((c) => c.san)).toContain("e4");
    expect(asBlack.map((c) => c.san)).toContain("d4");
  });

  it("ignores games the owner did not play", async () => {
    // Without an attributed colour there is no owner perspective to score from.
    await seedGame(null, "1-0", "e4", "e5");

    expect(await extractRepertoireCandidates({ color: "white" })).toEqual([]);
  });

  it("stops at the ply limit", async () => {
    await seedGame("white", "1-0", "e4", "e5", "Nf3", "Nc6", "Bb5");

    const candidates = await extractRepertoireCandidates({
      color: "white",
      maxPly: 2,
    });

    expect(candidates.map((c) => c.san)).toEqual(["e4", "e5"]);
  });

  it("marks what the repertoire already covers", async () => {
    await seedGame("white", "1-0", "e4", "e5");

    const before = await extractRepertoireCandidates({ color: "white" });
    expect(before.every((c) => !c.inRepertoire)).toBe(true);

    await adoptCandidates(before.filter((c) => c.san === "e4"));

    const after = await extractRepertoireCandidates({ color: "white" });
    expect(after.find((c) => c.san === "e4")?.inRepertoire).toBe(true);
    expect(after.find((c) => c.san === "e5")?.inRepertoire).toBe(false);
  });

  it("returns nothing when there are no games", async () => {
    expect(await extractRepertoireCandidates({ color: "white" })).toEqual([]);
  });
});

describe("adoptCandidates", () => {
  it("writes candidates into the repertoire", async () => {
    await seedGame("white", "1-0", "e4", "e5");
    const candidates = await extractRepertoireCandidates({ color: "white" });

    const result = await adoptCandidates(candidates);

    expect(result).toEqual({ added: 2, skipped: 0 });
    expect((await getRepertoire("white")).map((m) => m.san).sort()).toEqual(["e4", "e5"]);
  });

  it("produces moves shaped exactly like hand-entered ones", async () => {
    // Adopted moves go through the same validated path, so they carry the
    // notation a move played on the board would.
    await seedGame("white", "1-0", "e4");
    await adoptCandidates(await extractRepertoireCandidates({ color: "white" }));

    const [move] = await getRepertoire("white");
    expect(move).toMatchObject({ san: "e4", uci: "e2e4", color: "white" });
    expect(move.addedAt).toBeGreaterThan(0);
  });

  it("skips a move already prepared instead of duplicating it", async () => {
    await seedGame("white", "1-0", "e4", "e5");
    const candidates = await extractRepertoireCandidates({ color: "white" });

    await adoptCandidates(candidates);
    const again = await adoptCandidates(candidates);

    expect(again).toEqual({ added: 0, skipped: 2 });
    expect(await getRepertoire("white")).toHaveLength(2);
  });

  it("adopts nothing when given nothing", async () => {
    expect(await adoptCandidates([])).toEqual({ added: 0, skipped: 0 });
  });

  it("brings the line leading to a deep move", async () => {
    // Stored on its own, a move four plies in starts from a position nothing
    // reaches — counted in the totals but unreachable in the tree.
    await seedGame("white", "1-0", "d4", "Nf6", "Nf3", "g6");
    const candidates = await extractRepertoireCandidates({ color: "white" });
    const deep = candidates.filter((c) => c.san === "g6");

    const result = await adoptCandidates(deep, candidates);

    expect(result.added).toBe(4);
    // Sorted, because the store returns index order rather than line order;
    // what matters is that the whole line is present and connected.
    expect((await getRepertoire("white")).map((m) => m.san).sort()).toEqual([
      "Nf3",
      "Nf6",
      "d4",
      "g6",
    ]);
    expect(orphanedMoves(await getRepertoire("white"), REPERTOIRE_ROOT)).toEqual([]);
  });

  it("resolves a leading line the caller's filter had hidden", async () => {
    // The context is deliberately the unfiltered set: a prefix played once is
    // still needed to reach a move played three times.
    await seedGame("white", "1-0", "d4", "Nf6");
    await seedGame("white", "1-0", "e4", "e5");
    await seedGame("white", "1-0", "e4", "e5");

    const all = await extractRepertoireCandidates({ color: "white" });
    const often = all.filter((c) => c.played >= 2);

    await adoptCandidates(often, all);

    expect(orphanedMoves(await getRepertoire("white"), REPERTOIRE_ROOT)).toEqual([]);
  });

  it("counts a move shared by two chosen lines once", async () => {
    await seedGame("white", "1-0", "e4", "e5", "Nf3");
    await seedGame("white", "1-0", "e4", "c5", "Nf3");

    const candidates = await extractRepertoireCandidates({ color: "white" });
    const bothReplies = candidates.filter((c) => c.san === "e5" || c.san === "c5");

    // 1.e4 leads to both, and must not be written or counted twice.
    const result = await adoptCandidates(bothReplies, candidates);

    expect(result.added).toBe(3);
    expect(await getRepertoire("white")).toHaveLength(3);
  });

  it("produces a repertoire connected to the starting position", async () => {
    // Adopting a whole line must not leave islands: every adopted move has to
    // begin at a position the start actually reaches, or the tree view would
    // never show it.
    await seedGame("white", "1-0", "e4", "e5", "Nf3", "Nc6");
    await adoptCandidates(await extractRepertoireCandidates({ color: "white" }));

    const moves = await getRepertoire("white");
    expect(moves).toHaveLength(4);
    expect(orphanedMoves(moves, REPERTOIRE_ROOT)).toEqual([]);
  });
});
