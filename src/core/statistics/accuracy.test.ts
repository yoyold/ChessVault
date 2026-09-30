import { describe, expect, it } from "vitest";
import type { ColourSummary } from "@/core/analysis/game-report";
import type { GameAnalysisRecord } from "@/core/domain/game-analysis";
import { buildAccuracy } from "./accuracy";
import type { StatGame } from "./statistics";

function side(overrides: Partial<ColourSummary> & { moves?: number } = {}): ColourSummary {
  const { moves = 20, ...rest } = overrides;
  return {
    counts: { best: moves, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
    averageCentipawnLoss: 20,
    missedMates: 0,
    missedWins: 0,
    ...rest,
  };
}

function game(id: number, overrides: Partial<StatGame> = {}): StatGame {
  return {
    id,
    result: "1-0",
    playerColor: "white",
    dateIso: "2026-05-24",
    eco: "A45",
    opening: "London System",
    event: null,
    playerElo: 1500,
    opponentElo: 1500,
    ...overrides,
  };
}

function analysis(
  gameId: number,
  overrides: Partial<GameAnalysisRecord> = {},
): GameAnalysisRecord {
  return {
    gameId,
    depth: 14,
    engine: "Stockfish",
    analysedAt: 1,
    plies: 40,
    unevaluatedPlies: 0,
    white: side(),
    black: side(),
    errors: [],
    ...overrides,
  };
}

const records = (...list: GameAnalysisRecord[]) => new Map(list.map((r) => [r.gameId, r]));

describe("buildAccuracy", () => {
  it("counts only the owner's side of each game", () => {
    // The opponent blundered twice; that is not the owner's to work on.
    const stats = buildAccuracy(
      [game(1, { playerColor: "white" })],
      records(
        analysis(1, {
          white: side({ counts: { best: 18, good: 1, inaccuracy: 1, mistake: 0, blunder: 0 } }),
          black: side({ counts: { best: 17, good: 1, inaccuracy: 0, mistake: 0, blunder: 2 } }),
        }),
      ),
    );

    expect(stats.own).toMatchObject({ games: 1, moves: 20, inaccuracies: 1, blunders: 0 });
  });

  it("states how many games the figures rest on", () => {
    const stats = buildAccuracy([game(1), game(2), game(3)], records(analysis(2)));

    expect(stats.games).toBe(3);
    expect(stats.analysed).toBe(1);
  });

  it("weights the average loss by moves, not by games", () => {
    // A 10-move game at 100 and a 30-move game at 20: per move that is 40, not
    // the 60 a per-game average would claim.
    const stats = buildAccuracy(
      [game(1), game(2)],
      records(
        analysis(1, { white: side({ moves: 10, averageCentipawnLoss: 100 }) }),
        analysis(2, { white: side({ moves: 30, averageCentipawnLoss: 20 }) }),
      ),
    );

    expect(stats.own?.averageCentipawnLoss).toBe(40);
  });

  it("has no figures, rather than perfect ones, when nothing is analysed", () => {
    const stats = buildAccuracy([game(1)], new Map());

    expect(stats.own).toBeNull();
    expect(stats.byColor).toEqual({ white: null, black: null });
    expect(stats.byMoveNumber.every((row) => row.perHundredMoves === null)).toBe(true);
  });

  it("splits White from Black", () => {
    const stats = buildAccuracy(
      [game(1, { playerColor: "white" }), game(2, { playerColor: "black" })],
      records(
        analysis(1, { white: side({ averageCentipawnLoss: 10 }) }),
        analysis(2, { black: side({ averageCentipawnLoss: 50 }) }),
      ),
    );

    expect(stats.byColor.white?.averageCentipawnLoss).toBe(10);
    expect(stats.byColor.black?.averageCentipawnLoss).toBe(50);
  });

  it("respects the period, and leaves undated games out of one", () => {
    const stats = buildAccuracy(
      [game(1, { dateIso: "2025-06-01" }), game(2, { dateIso: "2026-06-01" }), game(3, { dateIso: "" })],
      records(analysis(1), analysis(2), analysis(3)),
      { from: "2026-01-01" },
    );

    expect(stats.games).toBe(1);
    expect(stats.analysed).toBe(1);
  });
});

describe("buildAccuracy — by move number", () => {
  it("places each of the owner's errors in its stretch of the game", () => {
    // As White, ply 23 is move 12 and ply 61 is move 31. Ply 24 is Black's.
    const stats = buildAccuracy(
      [game(1, { playerColor: "white" })],
      records(
        analysis(1, {
          plies: 80,
          errors: [
            { ply: 23, quality: "blunder" },
            { ply: 61, quality: "mistake" },
            { ply: 24, quality: "blunder" },
            { ply: 5, quality: "inaccuracy" },
          ],
        }),
      ),
    );

    const byBand = Object.fromEntries(stats.byMoveNumber.map((row) => [row.band, row]));
    expect(byBand["11-20"]).toMatchObject({ blunders: 1, mistakes: 0 });
    expect(byBand["31-40"]).toMatchObject({ blunders: 0, mistakes: 1 });
    // Inaccuracies are too fine-grained to count here; the opponent's not at all.
    expect(byBand["1-10"]).toMatchObject({ blunders: 0, mistakes: 0 });
  });

  it("rates errors against the moves actually played in each stretch", () => {
    // A 45-ply game as Black: Black plays moves 1–22, so 10 in the first
    // stretch, 10 in the second, 2 in the third, none after.
    const stats = buildAccuracy(
      [game(1, { playerColor: "black" })],
      records(analysis(1, { plies: 45, errors: [{ ply: 42, quality: "mistake" }] })),
    );

    expect(stats.byMoveNumber.map((row) => row.moves)).toEqual([10, 10, 2, 0, 0]);
    // One error in 2 moves played in moves 21–30.
    expect(stats.byMoveNumber[2].perHundredMoves).toBe(50);
    expect(stats.byMoveNumber[3].perHundredMoves).toBeNull();
  });
});

describe("buildAccuracy — openings", () => {
  it("groups by code and colour, most analysed first", () => {
    const stats = buildAccuracy(
      [
        game(1, { eco: "B01", opening: "Scandinavian Defense" }),
        game(2, { eco: "A45" }),
        game(3, { eco: "A45" }),
        game(4, { eco: "A45", playerColor: "black" }),
      ],
      records(analysis(1), analysis(2), analysis(3), analysis(4)),
    );

    expect(stats.openings.map((row) => `${row.color} ${row.eco} ${row.accuracy.games}`)).toEqual([
      "white A45 2",
      "black A45 1",
      "white B01 1",
    ]);
    expect(stats.openings[2].name).toBe("Scandinavian Defense");
  });

  it("leaves unanalysed games out of the opening rows", () => {
    const stats = buildAccuracy([game(1, { eco: "C50" })], new Map());

    expect(stats.openings).toEqual([]);
  });
});
