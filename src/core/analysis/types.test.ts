import { describe, expect, it } from "vitest";
import { formatScore, scoreToPawns, type Score } from "./types";

const cp = (value: number): Score => ({ type: "cp", value });
const mate = (value: number): Score => ({ type: "mate", value });

describe("scoreToPawns", () => {
  it("converts centipawns to pawns", () => {
    expect(scoreToPawns(cp(150))).toBe(1.5);
    expect(scoreToPawns(cp(-75))).toBe(-0.75);
    expect(scoreToPawns(cp(0))).toBe(0);
  });

  it("clamps a mate to a finite value so a graph stays readable", () => {
    // Without the cap, one forced mate would flatten every other point in the
    // game toward zero.
    expect(scoreToPawns(mate(3))).toBe(10);
    expect(scoreToPawns(mate(-1))).toBe(-10);
  });

  it("respects a custom cap", () => {
    expect(scoreToPawns(mate(2), 6)).toBe(6);
    expect(scoreToPawns(mate(-2), 6)).toBe(-6);
  });
});

describe("formatScore", () => {
  it("shows a signed pawn value to two places", () => {
    expect(formatScore(cp(35))).toBe("+0.35");
    expect(formatScore(cp(-120))).toBe("-1.20");
  });

  it("makes a positive score explicit rather than neutral", () => {
    // "0.35" reads as roughly level; chess notation signs it.
    expect(formatScore(cp(35)).startsWith("+")).toBe(true);
  });

  it("signs an exactly level score as positive", () => {
    expect(formatScore(cp(0))).toBe("+0.00");
  });

  it("formats a mate with its distance", () => {
    expect(formatScore(mate(3))).toBe("+M3");
    expect(formatScore(mate(-2))).toBe("-M2");
  });
});
