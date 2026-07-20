import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import {
  positionKey,
  positionKeyFromFen,
  sideToMoveOf,
} from "./position-key";

/** Replay SAN moves from the initial position and return the resulting key. */
function keyAfter(...moves: string[]) {
  const chess = new Chess();
  for (const move of moves) chess.move(move);
  return positionKey(chess);
}

describe("positionKey", () => {
  it("treats transpositions as the same position", () => {
    // Identical positions reached by different move orders. This is the whole
    // point of the key: without it, the opening tree would not deduplicate.
    expect(keyAfter("d4", "d5", "Nf3")).toBe(keyAfter("Nf3", "d5", "d4"));
  });

  it("ignores the halfmove clock and fullmove number", () => {
    // The two transposing lines above differ in halfmove clock (2.Nf3 is a
    // quiet move, 2.d4 resets it), so the assertion above already depends on
    // the counters being stripped. Assert it directly as well, so a regression
    // reports the actual cause rather than a confusing transposition failure.
    const key = keyAfter("d4", "d5", "Nf3");
    expect(key.split(" ")).toHaveLength(4);
  });

  it("distinguishes positions by side to move", () => {
    // Null-move equivalent: same placement, different side to move.
    const white = positionKeyFromFen("8/8/4k3/8/8/4K3/8/8 w - - 0 1");
    const black = positionKeyFromFen("8/8/4k3/8/8/4K3/8/8 b - - 0 1");
    expect(white).not.toBe(black);
  });

  it("distinguishes positions by castling rights", () => {
    const withRights = positionKeyFromFen(
      "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
    );
    const withoutRights = positionKeyFromFen(
      "r3k2r/8/8/8/8/8/8/R3K2R w - - 0 1",
    );
    expect(withRights).not.toBe(withoutRights);
  });
});

/**
 * These tests guard an assumption the implementation relies on rather than
 * implements: that the en-passant square is present only when a capture is
 * genuinely legal. If chess.js ever stops normalising this, deduplication would
 * silently degrade — identical positions would split into separate rows — so
 * the failure must surface here rather than in production data.
 */
describe("en-passant normalisation (invariant relied upon)", () => {
  it("omits the en-passant square when no pawn can capture", () => {
    // After 1.e4 the square e3 is passed over, but Black has no pawn able to
    // capture there, so it must not be part of the position's identity.
    const key = keyAfter("e4");
    expect(key.endsWith(" -")).toBe(true);
  });

  it("keeps the en-passant square when the capture is legal", () => {
    const key = positionKeyFromFen("k7/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
    expect(key.endsWith(" d6")).toBe(true);
  });

  it("omits the en-passant square when the capturing pawn is pinned", () => {
    // White's e5 pawn is pinned along the e-file by the rook on e8; exd6 would
    // expose the king on e1, so the capture is illegal despite being available
    // structurally.
    const key = positionKeyFromFen("k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
    expect(key.endsWith(" -")).toBe(true);
  });

  it("normalises a hand-written FEN that sets the square spuriously", () => {
    // Third-party and hand-written FENs routinely set the square unconditionally.
    const spurious = positionKeyFromFen(
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    );
    expect(spurious).toBe(keyAfter("e4"));
  });
});

describe("sideToMoveOf", () => {
  it("extracts the side to move", () => {
    expect(sideToMoveOf(keyAfter())).toBe("w");
    expect(sideToMoveOf(keyAfter("e4"))).toBe("b");
  });
});
