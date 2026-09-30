import { describe, expect, it } from "vitest";
import type { GameResult } from "@/core/domain/game";
import { buildStatistics, ratingBand, type StatGame } from "./statistics";

function game(overrides: Partial<StatGame> = {}): StatGame {
  return {
    result: "1-0",
    playerColor: "white",
    dateIso: "2026-05-24",
    eco: "A45",
    opening: "Indian Defense",
    event: "Club Championship",
    playerElo: 1500,
    opponentElo: 1500,
    ...overrides,
  };
}

/** A game won, drawn or lost from the owner's side, whichever colour they had. */
function scored(
  outcome: "win" | "draw" | "loss",
  overrides: Partial<StatGame> = {},
): StatGame {
  const color = overrides.playerColor ?? "white";
  const result: GameResult =
    outcome === "draw"
      ? "1/2-1/2"
      : (outcome === "win") === (color === "white")
        ? "1-0"
        : "0-1";

  return game({ ...overrides, playerColor: color, result });
}

describe("buildStatistics — totals", () => {
  it("counts results from the owner's side, whichever colour they had", () => {
    const stats = buildStatistics([
      scored("win", { playerColor: "white" }),
      scored("win", { playerColor: "black" }),
      scored("draw"),
      scored("loss", { playerColor: "black" }),
    ]);

    expect(stats.total.tally).toMatchObject({ games: 4, wins: 2, draws: 1, losses: 1 });
    expect(stats.total.tally.score).toBe(0.625);
  });

  it("splits White from Black", () => {
    const stats = buildStatistics([
      scored("win", { playerColor: "white" }),
      scored("loss", { playerColor: "black" }),
      scored("loss", { playerColor: "black" }),
    ]);

    expect(stats.byColor.white.tally.score).toBe(1);
    expect(stats.byColor.black.tally).toMatchObject({ games: 2, losses: 2, score: 0 });
  });

  it("counts an unfinished game without inventing a result for it", () => {
    const stats = buildStatistics([scored("win"), game({ result: "*" })]);

    expect(stats.total.tally).toMatchObject({ games: 2, scored: 1, score: 1 });
  });
});

describe("buildStatistics — ratings", () => {
  it("measures the score against what the ratings predicted", () => {
    // Beating a 1900 player as a 1500: far above expectation.
    const stats = buildStatistics([scored("win", { playerElo: 1500, opponentElo: 1900 })]);

    expect(stats.total.rating).toMatchObject({ games: 1, averageOpponent: 1900, actual: 1 });
    expect(stats.total.rating.expected).toBeCloseTo(1 / 11, 5);
    expect(stats.total.rating.performance).toBeGreaterThan(1900);
  });

  it("rests rating figures only on games where both ratings are known", () => {
    const stats = buildStatistics([
      scored("win", { opponentElo: 1600 }),
      scored("loss", { opponentElo: null }),
      scored("loss", { playerElo: null }),
    ]);

    // Three games played, one of them measurable against a rating.
    expect(stats.total.tally.games).toBe(3);
    expect(stats.total.rating).toMatchObject({ games: 1, averageOpponent: 1600, actual: 1 });
  });

  it("gives no rating figures rather than fake ones when nothing is rated", () => {
    const stats = buildStatistics([scored("win", { playerElo: null })]);

    expect(stats.total.rating).toEqual({
      games: 0,
      averageOpponent: null,
      performance: null,
      expected: null,
      actual: null,
    });
  });
});

describe("buildStatistics — opponent strength", () => {
  it("files opponents by how their rating compared", () => {
    expect(ratingBand(1500, 1250)).toBe("much-lower");
    expect(ratingBand(1500, 1300)).toBe("much-lower");
    expect(ratingBand(1500, 1301)).toBe("lower");
    expect(ratingBand(1500, 1450)).toBe("lower");
    expect(ratingBand(1500, 1451)).toBe("similar");
    expect(ratingBand(1500, 1549)).toBe("similar");
    expect(ratingBand(1500, 1550)).toBe("higher");
    expect(ratingBand(1500, 1700)).toBe("much-higher");
  });

  it("always returns all five bands in order, empty ones included", () => {
    const stats = buildStatistics([scored("win", { opponentElo: 1500 })]);

    expect(stats.bands.map((row) => row.band)).toEqual([
      "much-lower",
      "lower",
      "similar",
      "higher",
      "much-higher",
    ]);
    expect(stats.bands.find((row) => row.band === "higher")?.tally.games).toBe(0);
    expect(stats.bands.find((row) => row.band === "similar")?.tally.games).toBe(1);
  });

  it("leaves games without both ratings out of the bands", () => {
    const stats = buildStatistics([scored("win", { opponentElo: null })]);

    expect(stats.bands.every((row) => row.tally.games === 0)).toBe(true);
  });
});

describe("buildStatistics — openings", () => {
  it("keeps the same code apart for each colour", () => {
    // A45 as White and A45 as Black are different experiences of one code.
    const stats = buildStatistics([
      scored("win", { playerColor: "white", eco: "A45" }),
      scored("loss", { playerColor: "black", eco: "A45" }),
    ]);

    expect(stats.openings).toHaveLength(2);
    expect(stats.openings.map((row) => `${row.color} ${row.tally.score}`).sort()).toEqual([
      "black 0",
      "white 1",
    ]);
  });

  it("names a code by the name it carries most often", () => {
    const stats = buildStatistics([
      scored("win", { opening: "London System" }),
      scored("win", { opening: "London System" }),
      scored("win", { opening: "Indian Defense" }),
      scored("win", { opening: null }),
    ]);

    expect(stats.openings[0]).toMatchObject({ eco: "A45", name: "London System" });
    expect(stats.openings[0].tally.games).toBe(4);
  });

  it("puts the most played first", () => {
    const stats = buildStatistics([
      scored("win", { eco: "B01" }),
      scored("win", { eco: "C50" }),
      scored("win", { eco: "C50" }),
    ]);

    expect(stats.openings.map((row) => row.eco)).toEqual(["C50", "B01"]);
  });

  it("groups games without a code together rather than dropping them", () => {
    const stats = buildStatistics([scored("win", { eco: null, opening: null })]);

    expect(stats.openings[0]).toMatchObject({ eco: null, name: null });
  });
});

describe("buildStatistics — over time", () => {
  it("groups by year, newest first", () => {
    const stats = buildStatistics([
      scored("win", { dateIso: "2024-03-01" }),
      scored("loss", { dateIso: "2026-01-10" }),
      scored("draw", { dateIso: "2026-06-01" }),
    ]);

    expect(stats.years.map((row) => [row.year, row.tally.games])).toEqual([
      ["2026", 2],
      ["2024", 1],
    ]);
  });

  it("orders tournaments by their latest game", () => {
    const stats = buildStatistics([
      scored("win", { event: "Spring Open", dateIso: "2026-04-01" }),
      scored("win", { event: "Club Championship", dateIso: "2026-06-01" }),
      scored("win", { event: "Spring Open", dateIso: "2026-04-02" }),
    ]);

    expect(stats.events.map((row) => [row.event, row.lastDate, row.tally.games])).toEqual([
      ["Club Championship", "2026-06-01", 1],
      ["Spring Open", "2026-04-02", 2],
    ]);
  });

  it("traces the owner's rating oldest first, one point per day", () => {
    const stats = buildStatistics([
      scored("win", { dateIso: "2026-02-01", playerElo: 1510 }),
      scored("win", { dateIso: "2026-01-01", playerElo: 1500 }),
      scored("win", { dateIso: "2026-02-01", playerElo: 1512 }),
      scored("win", { dateIso: "", playerElo: 1600 }),
    ]);

    expect(stats.ratingHistory).toEqual([
      { dateIso: "2026-01-01", rating: 1500 },
      { dateIso: "2026-02-01", rating: 1512 },
    ]);
  });
});

describe("buildStatistics — periods", () => {
  const games = [
    scored("win", { dateIso: "2025-12-31" }),
    scored("loss", { dateIso: "2026-01-01" }),
    scored("draw", { dateIso: "2026-12-31" }),
    scored("win", { dateIso: "" }),
  ];

  it("includes both ends of a period", () => {
    const stats = buildStatistics(games, { from: "2026-01-01", to: "2026-12-31" });

    expect(stats.total.tally).toMatchObject({ games: 2, losses: 1, draws: 1 });
  });

  it("states how many undated games a period had to leave out", () => {
    // An undated game cannot be placed inside or outside a year; counting it
    // in either would be a guess.
    const stats = buildStatistics(games, { from: "2026-01-01" });

    expect(stats.undatedExcluded).toBe(1);
    expect(stats.total.tally.games).toBe(2);
  });

  it("keeps undated games when no period is asked for", () => {
    const stats = buildStatistics(games);

    expect(stats.total.tally.games).toBe(4);
    expect(stats.undatedExcluded).toBe(0);
  });
});
