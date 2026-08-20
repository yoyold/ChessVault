import { describe, expect, it } from "vitest";
import { summarisePosition, type PositionVisit } from "./explorer";

function visit(overrides: Partial<PositionVisit> = {}): PositionVisit {
  return {
    gameId: 1,
    san: "e4",
    result: "1-0",
    playerColor: "white",
    ...overrides,
  };
}

describe("summarisePosition", () => {
  it("reports nothing for a position no game reached", () => {
    const stats = summarisePosition([]);

    expect(stats.games).toBe(0);
    expect(stats.moves).toEqual([]);
    expect(stats.scored).toBe(0);
  });

  it("groups games by the move played from the position", () => {
    const stats = summarisePosition([
      visit({ gameId: 1, san: "e4" }),
      visit({ gameId: 2, san: "e4" }),
      visit({ gameId: 3, san: "d4" }),
    ]);

    expect(stats.games).toBe(3);
    expect(stats.moves.map((move) => [move.san, move.games])).toEqual([
      ["e4", 2],
      ["d4", 1],
    ]);
  });

  it("orders equally played moves alphabetically, so the table does not shuffle", () => {
    const stats = summarisePosition([
      visit({ gameId: 1, san: "d4" }),
      visit({ gameId: 2, san: "c4" }),
    ]);

    expect(stats.moves.map((move) => move.san)).toEqual(["c4", "d4"]);
  });

  it("scores from the owner's perspective, whichever side they had", () => {
    // The same "0-1" is a loss with White and a win with Black.
    const stats = summarisePosition([
      visit({ gameId: 1, result: "0-1", playerColor: "white" }),
      visit({ gameId: 2, result: "0-1", playerColor: "black" }),
    ]);

    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(1);
    expect(stats.score).toBe(0.5);
  });

  it("counts a draw as half a point", () => {
    const stats = summarisePosition([
      visit({ gameId: 1, result: "1-0" }),
      visit({ gameId: 2, result: "1/2-1/2" }),
    ]);

    expect(stats.score).toBe(0.75);
  });

  it("leaves games with no owner result out of the record but not out of the count", () => {
    const stats = summarisePosition([
      visit({ gameId: 1, result: "1-0" }),
      // Still in progress.
      visit({ gameId: 2, result: "*" }),
      // Between two other people.
      visit({ gameId: 3, result: "1-0", playerColor: null }),
    ]);

    expect(stats.games).toBe(3);
    expect(stats.scored).toBe(1);
    expect(stats.score).toBe(1);
    expect(stats.moves[0].games).toBe(3);
    expect(stats.moves[0].scored).toBe(1);
  });

  it("reports a share of the games at the position", () => {
    const stats = summarisePosition([
      visit({ gameId: 1, san: "e4" }),
      visit({ gameId: 2, san: "e4" }),
      visit({ gameId: 3, san: "e4" }),
      visit({ gameId: 4, san: "d4" }),
    ]);

    expect(stats.moves[0].share).toBe(0.75);
    expect(stats.moves[1].share).toBe(0.25);
  });

  it("counts games that ended in the position without inventing a move", () => {
    const stats = summarisePosition([
      visit({ gameId: 1, san: null, result: "1-0" }),
      visit({ gameId: 2, san: "e4" }),
    ]);

    expect(stats.ended).toBe(1);
    expect(stats.games).toBe(2);
    expect(stats.moves).toHaveLength(1);
    // The finished game still counts towards the position's own record.
    expect(stats.scored).toBe(2);
  });
});
