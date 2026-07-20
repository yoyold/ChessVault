import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/persistence/db";
import { positionKeyFromFen } from "@/core/chess/position-key";
import type { PositionAnalysis } from "@/core/analysis/types";
import {
  countEvaluatedAtDepth,
  getEvaluation,
  getEvaluations,
  saveEvaluation,
} from "./evaluation-repository";

const KEY = positionKeyFromFen(
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
);
const OTHER_KEY = positionKeyFromFen(
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
);

function analysis(depth: number, lineCount = 1): PositionAnalysis {
  return {
    depth,
    engine: "Test engine",
    lines: Array.from({ length: lineCount }, (_, index) => ({
      multiPv: index + 1,
      depth,
      score: { type: "cp" as const, value: 30 - index * 10 },
      moves: ["e2e4"],
    })),
  };
}

beforeEach(async () => {
  await db.open();
  await db.evaluations.clear();
});

describe("saveEvaluation", () => {
  it("stores a new evaluation", async () => {
    expect(await saveEvaluation(KEY, analysis(20))).toBe(true);

    const stored = await getEvaluation(KEY);
    expect(stored).toMatchObject({ depth: 20, engine: "Test engine" });
    expect(stored?.lines[0].score).toEqual({ type: "cp", value: 30 });
  });

  it("replaces a shallower evaluation with a deeper one", async () => {
    await saveEvaluation(KEY, analysis(15));
    expect(await saveEvaluation(KEY, analysis(25))).toBe(true);

    expect((await getEvaluation(KEY))?.depth).toBe(25);
  });

  it("keeps the deeper evaluation when a shallower one arrives", async () => {
    // Glancing at a position with a quick search must not discard a deep
    // evaluation that took far longer to produce.
    await saveEvaluation(KEY, analysis(25));
    expect(await saveEvaluation(KEY, analysis(12))).toBe(false);

    expect((await getEvaluation(KEY))?.depth).toBe(25);
  });

  it("prefers more variations at equal depth", async () => {
    await saveEvaluation(KEY, analysis(20, 1));
    expect(await saveEvaluation(KEY, analysis(20, 3))).toBe(true);

    expect((await getEvaluation(KEY))?.multiPv).toBe(3);
  });

  it("does not lose variations to an equally deep single-line result", async () => {
    await saveEvaluation(KEY, analysis(20, 3));
    expect(await saveEvaluation(KEY, analysis(20, 1))).toBe(false);

    expect((await getEvaluation(KEY))?.multiPv).toBe(3);
  });

  it("replaces regardless of depth when forced", async () => {
    // Deliberate re-analysis, for instance after changing engine.
    await saveEvaluation(KEY, analysis(30));
    expect(await saveEvaluation(KEY, analysis(10), { force: true })).toBe(true);

    expect((await getEvaluation(KEY))?.depth).toBe(10);
  });
});

describe("getEvaluations", () => {
  it("loads many positions at once", async () => {
    await saveEvaluation(KEY, analysis(20));
    await saveEvaluation(OTHER_KEY, analysis(18));

    const found = await getEvaluations([KEY, OTHER_KEY]);
    expect(found.size).toBe(2);
    expect(found.get(OTHER_KEY)?.depth).toBe(18);
  });

  it("omits positions with no evaluation rather than returning gaps", async () => {
    await saveEvaluation(KEY, analysis(20));

    const found = await getEvaluations([KEY, OTHER_KEY]);
    expect(found.has(KEY)).toBe(true);
    expect(found.has(OTHER_KEY)).toBe(false);
  });
});

describe("countEvaluatedAtDepth", () => {
  it("counts positions meeting a depth threshold", async () => {
    await saveEvaluation(KEY, analysis(20));
    await saveEvaluation(OTHER_KEY, analysis(10));

    expect(await countEvaluatedAtDepth(15)).toBe(1);
    expect(await countEvaluatedAtDepth(10)).toBe(2);
  });
});
