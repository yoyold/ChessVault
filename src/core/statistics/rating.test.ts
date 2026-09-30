import { describe, expect, it } from "vitest";
import { expectedScore, performanceRating } from "./rating";

describe("expectedScore", () => {
  it("expects half the points between equals", () => {
    expect(expectedScore(1500, 1500)).toBe(0.5);
  });

  it("follows the Elo curve", () => {
    // 400 points of difference is ten-to-one odds: 10/11 of the points.
    expect(expectedScore(1900, 1500)).toBeCloseTo(10 / 11, 10);
    expect(expectedScore(1500, 1900)).toBeCloseTo(1 / 11, 10);
  });

  it("is symmetric: the two sides' expectations add up to one game", () => {
    expect(expectedScore(1518, 1244) + expectedScore(1244, 1518)).toBeCloseTo(1, 10);
  });
});

describe("performanceRating", () => {
  it("equals the opposition for an even score", () => {
    expect(performanceRating(1600, 0.5)).toBe(1600);
  });

  it("inverts the expectation exactly", () => {
    // Scoring what a 1900 player would expect against 1500 opposition is a
    // 1900 performance — the two functions describe one model.
    expect(performanceRating(1500, expectedScore(1900, 1500))).toBe(1900);
  });

  it("stays finite for a clean sweep or a whitewash", () => {
    expect(performanceRating(1500, 1)).toBe(2298);
    expect(performanceRating(1500, 0)).toBe(702);
  });

  it("rises with the score", () => {
    expect(performanceRating(1500, 0.75)).toBeGreaterThan(performanceRating(1500, 0.6));
  });
});
