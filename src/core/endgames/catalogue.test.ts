import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { describeGoal, drillById, ENDGAME_DRILLS } from "./catalogue";

describe("the endgame catalogue", () => {
  it("gives every drill its own id", () => {
    const ids = ENDGAME_DRILLS.map((drill) => drill.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const drill of ENDGAME_DRILLS) {
    it(`starts "${drill.title}" from a legal position still in play`, () => {
      const board = new Chess(drill.fen);
      expect(board.isGameOver()).toBe(false);
      expect(board.moves().length).toBeGreaterThan(0);
    });
  }

  it("leaves a player with something to promote in every promoting drill", () => {
    for (const drill of ENDGAME_DRILLS.filter((entry) => entry.goal.type === "promote")) {
      const board = new Chess(drill.fen);
      const pawns = board
        .board()
        .flat()
        .filter((square) => square?.type === "p" && square.color === board.turn());
      expect(pawns.length, drill.id).toBeGreaterThan(0);
    }
  });

  it("is introduced easiest first", () => {
    const levels = ENDGAME_DRILLS.map((drill) => drill.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });

  it("finds drills by id", () => {
    expect(drillById("lucena")?.title).toMatch(/Lucena/);
    expect(drillById("nonsense")).toBeUndefined();
  });

  it("says what each goal asks", () => {
    expect(describeGoal({ type: "draw", moves: 15 })).toBe("Hold the draw for 15 moves.");
    expect(describeGoal({ type: "mate" })).toBe("Checkmate.");
  });
});
