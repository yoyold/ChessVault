import { describe, expect, it } from "vitest";
import type { GameResult } from "@/core/domain/game";
import { recentForm, type FormGame } from "./form";

/** White games, newest first. */
function games(results: GameResult[], ratings: (number | null)[] = []): FormGame[] {
  return results.map((result, index) => ({
    result,
    playerColor: "white",
    playerElo: ratings[index] ?? null,
  }));
}

describe("recentForm", () => {
  it("counts results from the owner's side", () => {
    const form = recentForm([
      { result: "0-1", playerColor: "black", playerElo: null },
      { result: "0-1", playerColor: "white", playerElo: null },
      { result: "1/2-1/2", playerColor: "white", playerElo: null },
    ]);

    expect(form.tally).toMatchObject({ games: 3, wins: 1, draws: 1, losses: 1, score: 0.5 });
  });

  it("reads the rating from the newest game that has one", () => {
    const form = recentForm(games(["1-0", "1-0", "0-1", "1-0"], [null, 1712, 1690, 1675]));

    expect(form.rating).toBe(1712);
    expect(form.ratingChange).toBe(37);
  });

  it("has no change to report from one rating", () => {
    const form = recentForm(games(["1-0", "1-0"], [1700, null]));

    expect(form).toMatchObject({ rating: 1700, ratingChange: null });
  });

  it("finds the streak the newest games end on", () => {
    expect(recentForm(games(["1-0", "1-0", "1-0", "0-1"])).streak).toEqual({
      outcome: "win",
      games: 3,
    });
    expect(recentForm(games(["0-1", "1-0", "1-0"])).streak).toBeNull();
  });

  it("does not let an unfinished game break a streak", () => {
    expect(recentForm(games(["0-1", "*", "0-1"])).streak).toEqual({ outcome: "loss", games: 2 });
  });

  it("is empty without games", () => {
    expect(recentForm([])).toMatchObject({
      tally: { games: 0, scored: 0 },
      rating: null,
      ratingChange: null,
      streak: null,
    });
  });
});
