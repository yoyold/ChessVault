import { describe, expect, it } from "vitest";
import { legalTargets } from "./legal-moves";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("legalTargets", () => {
  it("lists where a piece can go", () => {
    expect(legalTargets(START, "e2").sort()).toEqual(["e3", "e4"]);
    expect(legalTargets(START, "g1").sort()).toEqual(["f3", "h3"]);
  });

  it("counts a promotion square once", () => {
    // Four promotion pieces are four moves but one destination, and the
    // destination is what a player clicks.
    expect(legalTargets("4k3/P7/8/8/8/8/8/4K3 w - - 0 1", "a7")).toEqual(["a8"]);
  });

  it("offers nothing for the side that is not to move", () => {
    expect(legalTargets(START, "e7")).toEqual([]);
  });

  it("offers nothing for an empty square", () => {
    expect(legalTargets(START, "e4")).toEqual([]);
  });

  it("respects a pin", () => {
    // Rook on e8, knight on e2, king behind it on e1: the knight cannot leave
    // the file at all. A board that offered those squares would be offering
    // illegal moves.
    expect(legalTargets("4r2k/8/8/8/8/8/4N3/4K3 w - - 0 1", "e2")).toEqual([]);
  });

  it("offers only the moves that answer a check", () => {
    // Rook on h1 checking along the rank; the knight's one legal move is the
    // square that blocks it.
    expect(legalTargets("4k3/8/8/8/8/8/4N3/4K2r w - - 0 1", "e2")).toEqual(["g1"]);
  });

  it("includes castling as a king move", () => {
    expect(legalTargets("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1", "e1").sort()).toEqual([
      "c1",
      "d1",
      "d2",
      "e2",
      "f1",
      "f2",
      "g1",
    ]);
  });

  it("returns nothing for a position it cannot read", () => {
    expect(legalTargets("not a fen", "e2")).toEqual([]);
  });

  it("returns nothing for a square that does not exist", () => {
    expect(legalTargets(START, "z9")).toEqual([]);
  });
});
