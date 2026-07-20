import { describe, expect, it } from "vitest";
import { assessMove, winProbability } from "./move-quality";
import type { Score } from "./types";

const cp = (value: number): Score => ({ type: "cp", value });
const mate = (value: number): Score => ({ type: "mate", value });

function assess(before: Score, after: Score, moverColour: "w" | "b" = "w") {
  return assessMove({ before, after, moverColour, wasBestMove: false });
}

describe("winProbability", () => {
  it("is even at a level evaluation", () => {
    expect(winProbability(cp(0))).toBeCloseTo(0.5, 5);
  });

  it("rises with White's advantage and falls with Black's", () => {
    expect(winProbability(cp(100))).toBeGreaterThan(0.5);
    expect(winProbability(cp(-100))).toBeLessThan(0.5);
  });

  it("is symmetric around zero", () => {
    expect(winProbability(cp(250)) + winProbability(cp(-250))).toBeCloseTo(1, 5);
  });

  it("treats a forced mate as decided", () => {
    expect(winProbability(mate(3))).toBe(1);
    expect(winProbability(mate(-3))).toBe(0);
  });
});

describe("classification", () => {
  it("calls a small loss good", () => {
    expect(assess(cp(20), cp(10)).quality).toBe("good");
  });

  it("names the engine's own choice best", () => {
    const result = assessMove({
      before: cp(30),
      after: cp(30),
      moverColour: "w",
      wasBestMove: true,
    });
    expect(result.quality).toBe("best");
  });

  it("calls a move that loses nothing but was not the top choice good, not best", () => {
    // At limited depth several moves score alike; calling them all best would
    // overclaim what the engine actually established.
    expect(assess(cp(30), cp(30)).quality).toBe("good");
  });

  it("grades increasing losses as inaccuracy, mistake and blunder", () => {
    expect(assess(cp(0), cp(-50)).quality).toBe("inaccuracy");
    expect(assess(cp(0), cp(-120)).quality).toBe("mistake");
    expect(assess(cp(0), cp(-250)).quality).toBe("blunder");
  });
});

describe("why classification uses winning chances rather than centipawns", () => {
  // The same centipawn loss, classified oppositely depending on whether it
  // actually changed the likely outcome. This is the whole reason the module
  // does not classify on centipawns.
  it("does not punish a large centipawn drop in an already decided position", () => {
    // +15.00 to +10.00 is 500 centipawns and changes nothing: still completely won.
    const result = assess(cp(1500), cp(1000));

    expect(result.centipawnLoss).toBe(500);
    expect(result.quality).toBe("good");
  });

  it("does punish the same centipawn drop in a balanced position", () => {
    // 0.00 to −5.00 is the same 500 centipawns and throws the game away.
    const result = assess(cp(0), cp(-500));

    expect(result.centipawnLoss).toBe(500);
    expect(result.quality).toBe("blunder");
  });
});

describe("perspective", () => {
  it("measures loss for Black when Black moved", () => {
    // Evaluation moving from −0.60 to +0.60 is a loss for Black.
    const result = assess(cp(-60), cp(60), "b");

    expect(result.winProbabilityLoss).toBeGreaterThan(0);
    expect(result.quality).toBe("mistake");
  });

  it("does not count Black improving their position as a loss", () => {
    const result = assess(cp(100), cp(-100), "b");
    expect(result.winProbabilityLoss).toBe(0);
  });

  it("clamps search noise rather than reporting a negative loss", () => {
    // Limited depth can report a position as better after a move than before.
    const result = assess(cp(0), cp(50));
    expect(result.winProbabilityLoss).toBe(0);
    expect(result.centipawnLoss).toBe(0);
  });
});

describe("missed mate", () => {
  it("flags giving up a forced mate", () => {
    expect(assess(mate(3), cp(200)).missedMate).toBe(true);
  });

  it("does not flag converting one mate into another", () => {
    // Playing a different mating move is not a missed mate.
    expect(assess(mate(3), mate(4)).missedMate).toBe(false);
  });

  it("does not flag the opponent's mate as the mover's missed one", () => {
    // White to move in a position where Black is mating: nothing was missed.
    expect(assess(mate(-3), mate(-2)).missedMate).toBe(false);
  });

  it("flags a missed mate for Black too", () => {
    expect(assess(mate(-3), cp(-200), "b").missedMate).toBe(true);
  });
});

describe("missed win", () => {
  it("flags throwing away a winning position", () => {
    const result = assess(cp(800), cp(0));
    expect(result.missedWin).toBe(true);
  });

  it("does not flag a position that was never winning", () => {
    expect(assess(cp(50), cp(-200)).missedWin).toBe(false);
  });

  it("does not flag a winning position that stays winning", () => {
    expect(assess(cp(900), cp(700)).missedWin).toBe(false);
  });

  it("flags it from Black's perspective", () => {
    const result = assess(cp(-800), cp(0), "b");
    expect(result.missedWin).toBe(true);
  });
});
