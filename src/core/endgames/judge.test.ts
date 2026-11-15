import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { afterEvaluation, afterHolding, afterMove, forPlayer } from "./judge";

const MATE = { type: "mate" } as const;
const PROMOTE = { type: "promote" } as const;
const HOLD = { type: "draw", moves: 10 } as const;

/** A board after these moves from a position. */
function after(fen: string, ...moves: string[]): Chess {
  const board = new Chess(fen);
  for (const move of moves) board.move(move);
  return board;
}

describe("afterMove", () => {
  // The king in the corner, mated along the back rank.
  const mated = after("7k/8/6K1/8/8/8/8/1Q6 w - - 0 1", "Qb8#");

  it("calls the player's mate a success, whatever the goal", () => {
    expect(afterMove(MATE, mated, "player")).toEqual({ result: "achieved", reason: "Checkmate." });
    expect(afterMove(HOLD, mated, "player")?.result).toBe("achieved");
  });

  it("calls the engine's mate a failure", () => {
    expect(afterMove(HOLD, mated, "engine")).toEqual({
      result: "failed",
      reason: "You were mated.",
    });
  });

  it("calls a stalemate the end of a win, and a success when drawing", () => {
    const stalemate = after("7k/8/6K1/8/8/8/8/5Q2 w - - 0 1", "Qf7");
    expect(afterMove(MATE, stalemate, "player")).toEqual({
      result: "failed",
      reason: "Stalemate. The win is gone.",
    });
    expect(afterMove(HOLD, stalemate, "engine")?.result).toBe("achieved");
  });

  it("notices when too little is left to mate", () => {
    // The defending king takes the last pawn.
    const insufficient = after("8/8/8/8/k7/8/1p6/1K6 w - - 0 1", "Kxb2");
    expect(afterMove(HOLD, insufficient, "player")).toEqual({
      result: "achieved",
      reason: "Not enough material left to mate. The draw is yours.",
    });
  });

  it("lets the drill go on otherwise", () => {
    expect(afterMove(PROMOTE, after("4k3/8/4K3/4P3/8/8/8/8 w - - 0 1", "Kd6"), "player")).toBeNull();
  });
});

describe("afterEvaluation", () => {
  it("turns scores to the player's side", () => {
    expect(forPlayer({ type: "cp", value: 120 }, "b")).toEqual({ type: "cp", value: -120 });
    expect(forPlayer({ type: "mate", value: -3 }, "b")).toEqual({ type: "mate", value: 3 });
  });

  it("calls a promotion that keeps the win a success", () => {
    expect(afterEvaluation(PROMOTE, { type: "cp", value: 900 }, "w", true)).toEqual({
      result: "achieved",
      reason: "Promoted, and the win is safe.",
    });
    expect(afterEvaluation(PROMOTE, { type: "mate", value: 6 }, "w", true)?.result).toBe(
      "achieved",
    );
  });

  it("waits for the promotion while the win is still there", () => {
    expect(afterEvaluation(PROMOTE, { type: "cp", value: 1200 }, "w", false)).toBeNull();
  });

  it("fails a promoting drill whose win has gone", () => {
    expect(afterEvaluation(PROMOTE, { type: "cp", value: 20 }, "w", false)).toEqual({
      result: "failed",
      reason: "The win has slipped away.",
    });
    expect(afterEvaluation(PROMOTE, { type: "cp", value: 40 }, "w", true)?.reason).toBe(
      "Promoted, but the win is gone.",
    );
  });

  it("fails a drawing drill once the position is lost, from the player's side", () => {
    // Black defends; White's +6 is a loss for the player.
    expect(afterEvaluation(HOLD, { type: "cp", value: 600 }, "b", false)).toEqual({
      result: "failed",
      reason: "The position is lost now.",
    });
    expect(afterEvaluation(HOLD, { type: "cp", value: 60 }, "b", false)).toBeNull();
    expect(afterEvaluation(HOLD, { type: "mate", value: 4 }, "b", false)?.result).toBe("failed");
  });

  it("ignores the score when mating", () => {
    // The engine does not see these mates; only the rules decide.
    expect(afterEvaluation(MATE, { type: "cp", value: 30 }, "w", false)).toBeNull();
  });
});

describe("afterHolding", () => {
  it("succeeds once the moves are held", () => {
    expect(afterHolding(HOLD, 9)).toBeNull();
    expect(afterHolding(HOLD, 10)).toEqual({ result: "achieved", reason: "Held for 10 moves." });
    expect(afterHolding(PROMOTE, 50)).toBeNull();
  });
});
