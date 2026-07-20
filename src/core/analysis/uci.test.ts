import { describe, expect, it } from "vitest";
import { isSearchComplete, mergeLine, parseInfoLine } from "./uci";
import type { AnalysisLine } from "./types";

// A real line, captured from Stockfish 18 analysing the position after 1.e4 e5.
const REAL_LINE =
  "info depth 14 seldepth 28 multipv 1 score cp 38 nodes 127065 nps 713848 " +
  "hashfull 45 time 178 pv g1f3 d7d5 f3e5 f8d6";

describe("parseInfoLine", () => {
  it("parses depth, MultiPV slot, score and variation", () => {
    const line = parseInfoLine(REAL_LINE, "w");

    expect(line).toEqual({
      multiPv: 1,
      depth: 14,
      score: { type: "cp", value: 38 },
      moves: ["g1f3", "d7d5", "f3e5", "f8d6"],
    });
  });

  it("defaults the MultiPV slot when the engine omits it", () => {
    const line = parseInfoLine("info depth 5 score cp 20 pv e2e4", "w");
    expect(line?.multiPv).toBe(1);
  });

  it("parses a mate score", () => {
    const line = parseInfoLine("info depth 12 score mate 3 pv d1h5", "w");
    expect(line?.score).toEqual({ type: "mate", value: 3 });
  });

  describe("perspective normalisation", () => {
    // UCI scores are relative to the side to move. Normalising once here means
    // no consumer has to remember whose turn it was, which is otherwise a
    // recurring source of sign errors.
    it("keeps the sign when White is to move", () => {
      const line = parseInfoLine("info depth 10 score cp 50 pv e2e4", "w");
      expect(line?.score.value).toBe(50);
    });

    it("flips the sign when Black is to move", () => {
      // Black being 50 centipawns better is -50 from White's perspective.
      const line = parseInfoLine("info depth 10 score cp 50 pv e7e5", "b");
      expect(line?.score.value).toBe(-50);
    });

    it("flips mate scores too", () => {
      const line = parseInfoLine("info depth 10 score mate 2 pv d8h4", "b");
      expect(line?.score).toEqual({ type: "mate", value: -2 });
    });
  });

  describe("lines carrying no usable evaluation", () => {
    it("rejects bounded scores", () => {
      // Aspiration-window failures are thresholds, not evaluations. Accepting
      // them makes the evaluation jump wildly mid-search and would corrupt any
      // stored evaluation derived from it.
      expect(
        parseInfoLine("info depth 14 score cp 900 lowerbound pv e2e4", "w"),
      ).toBeNull();
      expect(
        parseInfoLine("info depth 14 score cp -900 upperbound pv e2e4", "w"),
      ).toBeNull();
    });

    it("rejects progress reports without a score", () => {
      expect(
        parseInfoLine("info depth 1 currmove e2e4 currmovenumber 1", "w"),
      ).toBeNull();
    });

    it("rejects a score without a variation", () => {
      expect(parseInfoLine("info depth 10 score cp 30", "w")).toBeNull();
    });

    it("rejects lines that are not info", () => {
      expect(parseInfoLine("bestmove g1f3 ponder d7d5", "w")).toBeNull();
      expect(parseInfoLine("readyok", "w")).toBeNull();
      expect(parseInfoLine("", "w")).toBeNull();
    });

    it("rejects a malformed score value", () => {
      expect(parseInfoLine("info depth 10 score cp x pv e2e4", "w")).toBeNull();
    });
  });
});

describe("mergeLine", () => {
  const line = (multiPv: number, depth: number, value: number): AnalysisLine => ({
    multiPv,
    depth,
    score: { type: "cp", value },
    moves: ["e2e4"],
  });

  it("adds a new MultiPV slot", () => {
    const merged = mergeLine([line(1, 10, 30)], line(2, 10, 10));
    expect(merged.map((l) => l.multiPv)).toEqual([1, 2]);
  });

  it("replaces a slot when a deeper report arrives", () => {
    const merged = mergeLine([line(1, 10, 30)], line(1, 14, 38));
    expect(merged).toHaveLength(1);
    expect(merged[0].depth).toBe(14);
  });

  it("ignores a shallower report for a slot already deeper", () => {
    // Engines re-report lower depths when re-searching a slot; accepting them
    // would make the display flicker backwards.
    const merged = mergeLine([line(1, 14, 38)], line(1, 10, 30));
    expect(merged[0].depth).toBe(14);
  });

  it("keeps slots ordered by MultiPV so the best line stays first", () => {
    const merged = mergeLine([line(2, 10, 10), line(3, 10, 5)], line(1, 10, 30));
    expect(merged.map((l) => l.multiPv)).toEqual([1, 2, 3]);
  });
});

describe("isSearchComplete", () => {
  it("recognises the end of a search", () => {
    expect(isSearchComplete("bestmove g1f3 ponder d7d5")).toBe(true);
    expect(isSearchComplete("info depth 14 score cp 38 pv g1f3")).toBe(false);
  });
});
