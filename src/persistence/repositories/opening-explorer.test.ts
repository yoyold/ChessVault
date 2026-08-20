import { beforeEach, describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { positionKey, positionKeyFromFen, type PositionKey } from "@/core/chess/position-key";
import type { Color, GameRecord, GameResult } from "@/core/domain/game";
import { db } from "@/persistence/db";
import { getExplorerPosition } from "./opening-explorer";

const START = positionKeyFromFen(new Chess().fen());

/**
 * Write a game and its positions straight to the tables.
 *
 * Not routed through the import pipeline, which lives a layer above
 * persistence: the explorer reads only what is stored, so seeding the stored
 * shape keeps this test independent of how the rows got there.
 */
async function seedGame(
  options: {
    playerColor?: Color | null;
    result?: GameResult;
    dateIso?: string;
    moves: string[];
  },
): Promise<number> {
  const { playerColor = "white", result = "1-0", dateIso = "2024-01-01" } = options;

  const board = new Chess();
  const positions: { key: PositionKey; san: string | null }[] = [
    { key: positionKey(board), san: null },
  ];

  for (const san of options.moves) {
    const move = board.move(san);
    positions.push({ key: positionKey(board), san: move.san });
  }

  const record: GameRecord = {
    contentHash: Math.random().toString(16),
    white: playerColor === "black" ? "Opponent" : "Owner",
    black: playerColor === "black" ? "Owner" : "Opponent",
    result,
    dateIso,
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
    plyCount: options.moves.length,
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

  return id;
}

/** The key of the position a line of SAN leads to. */
function keyAfter(...moves: string[]): PositionKey {
  const board = new Chess();
  for (const san of moves) board.move(san);
  return positionKey(board);
}

beforeEach(async () => {
  await db.open();
  await Promise.all([db.games.clear(), db.gamePositions.clear()]);
});

describe("getExplorerPosition", () => {
  it("reports the moves played from a position and how often", async () => {
    await seedGame({ moves: ["e4", "e5"] });
    await seedGame({ moves: ["e4", "c5"] });
    await seedGame({ moves: ["d4", "d5"] });

    const { stats } = await getExplorerPosition(START);

    expect(stats.games).toBe(3);
    expect(stats.moves.map((move) => [move.san, move.games])).toEqual([
      ["e4", 2],
      ["d4", 1],
    ]);
  });

  it("narrows to the position actually on the board", async () => {
    await seedGame({ moves: ["e4", "e5", "Nf3"] });
    await seedGame({ moves: ["e4", "c5", "Nf3"] });

    const { stats } = await getExplorerPosition(keyAfter("e4"));

    expect(stats.games).toBe(2);
    expect(stats.moves.map((move) => move.san)).toEqual(["c5", "e5"]);
  });

  it("scores from the owner's perspective on both sides of the board", async () => {
    // Same result, opposite sides: one win, one loss.
    await seedGame({ playerColor: "white", result: "1-0", moves: ["e4"] });
    await seedGame({ playerColor: "black", result: "1-0", moves: ["e4"] });

    const { stats } = await getExplorerPosition(START);

    expect(stats.scored).toBe(2);
    expect(stats.score).toBe(0.5);
  });

  it("counts a game once even when it returns to the position", async () => {
    // The knights walk out and back: the starting position of the manoeuvre
    // occurs twice in one game.
    await seedGame({ moves: ["Nf3", "Nf6", "Ng1", "Ng8", "e4"] });

    const { stats } = await getExplorerPosition(START);

    expect(stats.games).toBe(1);
    // The first arrival is the one reported, so the move is the one that
    // decided the position, not the repetition that came back to it.
    expect(stats.moves.map((move) => move.san)).toEqual(["Nf3"]);
  });

  it("finds transpositions, since the position is the key and not the move order", async () => {
    await seedGame({ moves: ["d4", "Nf6", "c4", "e6"] });
    await seedGame({ moves: ["c4", "e6", "d4", "Nf6"] });

    const { stats } = await getExplorerPosition(keyAfter("d4", "Nf6", "c4", "e6"));

    expect(stats.games).toBe(2);
  });

  it("restricts to one side when a colour is given", async () => {
    await seedGame({ playerColor: "white", moves: ["e4", "e5"] });
    await seedGame({ playerColor: "black", moves: ["e4", "c5"] });

    const { stats } = await getExplorerPosition(START, { color: "black" });

    expect(stats.games).toBe(1);
    expect(stats.moves.map((move) => move.san)).toEqual(["e4"]);
  });

  it("counts a game that ended in the position without a move to follow", async () => {
    await seedGame({ moves: ["f4", "e5", "g4", "Qh4#"] });

    const { stats } = await getExplorerPosition(keyAfter("f4", "e5", "g4", "Qh4#"));

    expect(stats.games).toBe(1);
    expect(stats.ended).toBe(1);
    expect(stats.moves).toEqual([]);
  });

  it("lists the games themselves, newest first", async () => {
    await seedGame({ dateIso: "2023-05-01", moves: ["e4"] });
    const recent = await seedGame({ dateIso: "2024-09-09", moves: ["e4"] });

    const { games } = await getExplorerPosition(START);

    expect(games.map((game) => game.id)).toEqual([recent, games[1].id]);
    expect(games[0].dateIso).toBe("2024-09-09");
  });

  it("returns nothing for a position no game reached", async () => {
    await seedGame({ moves: ["e4"] });

    const result = await getExplorerPosition(keyAfter("a4"));

    expect(result.stats.games).toBe(0);
    expect(result.games).toEqual([]);
  });
});
