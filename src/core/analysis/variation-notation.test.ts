import { describe, expect, it } from "vitest";
import { formatVariation, plyFromFen, variationToSan } from "./variation-notation";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("plyFromFen", () => {
  it("counts the opening move as ply one", () => {
    expect(plyFromFen(START)).toBe(1);
  });

  it("counts Black's reply as the second ply", () => {
    expect(
      plyFromFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"),
    ).toBe(2);
  });

  it("follows the move counter rather than the pieces", () => {
    // White to move on move 24 is ply 47, whatever stands on the board.
    expect(plyFromFen("8/8/8/8/8/8/8/K6k w - - 0 24")).toBe(47);
    expect(plyFromFen("8/8/8/8/8/8/8/K6k b - - 0 24")).toBe(48);
  });

  it("falls back to the first move when the counter is missing", () => {
    expect(plyFromFen("8/8/8/8/8/8/8/K6k w - -")).toBe(1);
  });
});

describe("variationToSan", () => {
  it("names the piece that moved", () => {
    // The whole point: g1f3 says where something went, Nf3 says what went.
    expect(variationToSan(START, ["e2e4", "e7e5", "g1f3"])).toEqual([
      "e4",
      "e5",
      "Nf3",
    ]);
  });

  it("disambiguates when two pieces could reach the square", () => {
    // Both knights reach e2, so the destination alone does not identify the
    // move and the file has to be written out. Nothing short of replaying the
    // position can know that.
    const twoKnights = "4k3/8/8/8/8/2N5/8/4K1N1 w - - 0 1";
    expect(variationToSan(twoKnights, ["c3e2"])).toEqual(["Nce2"]);
    expect(variationToSan(twoKnights, ["g1e2"])).toEqual(["Nge2"]);
  });

  it("writes castling as castling rather than a king move", () => {
    const castleable = "4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1";
    expect(variationToSan(castleable, ["e1g1"])).toEqual(["O-O"]);
  });

  it("writes captures, checks and promotions as they are read", () => {
    expect(variationToSan("4k3/P7/8/8/8/8/8/4K3 w - - 0 1", ["a7a8q"])).toEqual([
      "a8=Q+",
    ]);
  });

  it("stops at a move that will not play instead of throwing", () => {
    // A variation left over from the previous position is still in hand while
    // the next search starts. Rendering must survive it.
    expect(variationToSan(START, ["e2e4", "e2e4", "d2d4"])).toEqual(["e4"]);
  });

  it("ignores a truncated move", () => {
    expect(variationToSan(START, ["e2e4", "e7"])).toEqual(["e4"]);
  });

  it("returns nothing for a position it cannot read", () => {
    expect(variationToSan("not a fen", ["e2e4"])).toEqual([]);
  });

  it("stops at the ply limit", () => {
    expect(variationToSan(START, ["e2e4", "e7e5", "g1f3"], 2)).toEqual(["e4", "e5"]);
  });
});

describe("formatVariation", () => {
  it("numbers the moves from the position's own counter", () => {
    expect(formatVariation(START, ["e2e4", "e7e5", "g1f3"])).toBe("1. e4 e5 2. Nf3");
  });

  it("marks a line that starts on Black's move", () => {
    // Without the ellipsis the first move reads as White's.
    const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
    expect(formatVariation(afterE4, ["e7e5", "g1f3"])).toBe("1... e5 2. Nf3");
  });

  it("is empty when nothing could be read", () => {
    expect(formatVariation(START, [])).toBe("");
  });
});
