import { describe, expect, it } from "vitest";
import { buildTimeline, formatMoveNumber } from "./game-timeline";
import { PgnParseError } from "./parse-game";

const GAME = '[Event "Club"]\n\n1. e4 e5 2. Nf3 Nc6 1-0';

describe("buildTimeline", () => {
  it("includes the starting position and one node per move", () => {
    const timeline = buildTimeline(GAME);
    expect(timeline).toHaveLength(5);
    expect(timeline[0]).toMatchObject({ ply: 0, san: null, sideToMove: "w" });
    expect(timeline[4]).toMatchObject({ ply: 4, san: "Nc6", sideToMove: "w" });
  });

  it("produces complete FENs including move counters", () => {
    // The engine needs the counters; the position key deliberately omits them,
    // which is why this cannot be rebuilt from stored keys.
    const timeline = buildTimeline(GAME);
    expect(timeline[0].fen.split(" ")).toHaveLength(6);
    expect(timeline[0].fen).toBe(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    );
  });

  it("alternates the side to move", () => {
    const timeline = buildTimeline(GAME);
    expect(timeline.map((node) => node.sideToMove)).toEqual([
      "w",
      "b",
      "w",
      "b",
      "w",
    ]);
  });

  it("starts from a set-up position", () => {
    const setup = '[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 *';
    const timeline = buildTimeline(setup);
    expect(timeline[0].fen).toBe("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
  });

  it("handles a game with no moves", () => {
    const timeline = buildTimeline('[Event "A"]\n[Result "1-0"]\n\n1-0');
    expect(timeline).toHaveLength(1);
    expect(timeline[0].ply).toBe(0);
  });

  it("throws PgnParseError on illegal movetext", () => {
    expect(() => buildTimeline('[Event "A"]\n\n1. e4 e5 2. Kd8 *')).toThrow(
      PgnParseError,
    );
  });
});

describe("formatMoveNumber", () => {
  it("numbers White's moves plainly and Black's with an ellipsis", () => {
    expect(formatMoveNumber(1)).toBe("1.");
    expect(formatMoveNumber(2)).toBe("1...");
    expect(formatMoveNumber(3)).toBe("2.");
    expect(formatMoveNumber(24)).toBe("12...");
  });

  it("renders nothing for the starting position", () => {
    expect(formatMoveNumber(0)).toBe("");
  });
});
