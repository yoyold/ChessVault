import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { positionKey } from "@/core/chess/position-key";
import type { Color, GameResult } from "@/core/domain/game";
import { extractCandidates, type ExtractionGame } from "./extraction";

/** A game reduced to its positions, as the position table stores it. */
function gameOf(
  playerColor: Color,
  result: GameResult,
  ...sanMoves: string[]
): ExtractionGame {
  const board = new Chess();
  const positions: { key: ReturnType<typeof positionKey>; san: string | null }[] = [
    { key: positionKey(board), san: null },
  ];

  for (const san of sanMoves) {
    const move = board.move(san);
    positions.push({ key: positionKey(board), san: move.san });
  }

  return { playerColor, result, positions };
}

/** The candidate for one move, by notation. */
function find(candidates: ReturnType<typeof extractCandidates>, san: string) {
  return candidates.find((candidate) => candidate.san === san);
}

describe("aggregating moves across games", () => {
  it("counts how often a move was played", () => {
    const candidates = extractCandidates([
      gameOf("white", "1-0", "e4", "e5"),
      gameOf("white", "0-1", "e4", "c5"),
      gameOf("white", "1-0", "d4", "d5"),
    ]);

    expect(find(candidates, "e4")?.played).toBe(2);
    expect(find(candidates, "d4")?.played).toBe(1);
  });

  it("records where each move leads", () => {
    const candidates = extractCandidates([gameOf("white", "1-0", "e4")]);
    const e4 = find(candidates, "e4");

    const board = new Chess();
    board.move("e4");
    expect(e4?.toKey).toBe(positionKey(board));
  });

  it("merges move orders that reach the same position", () => {
    // The reason aggregation is keyed by position: 1.d4 Nf6 2.c4 and
    // 1.c4 Nf6 2.d4 arrive at one position, so a reply played there in either
    // game is the same decision and counts twice.
    const candidates = extractCandidates([
      gameOf("white", "1-0", "d4", "Nf6", "c4", "e6"),
      gameOf("white", "1-0", "c4", "Nf6", "d4", "e6"),
    ]);

    expect(find(candidates, "e6")?.played).toBe(2);
  });

  it("keeps the White and Black repertoires apart", () => {
    const candidates = extractCandidates([
      gameOf("white", "1-0", "e4"),
      gameOf("black", "0-1", "e4"),
    ]);

    expect(candidates.filter((c) => c.san === "e4")).toHaveLength(2);
    expect(candidates.map((c) => c.color).sort()).toEqual(["black", "white"]);
  });
});

describe("scoring from the owner's perspective", () => {
  it("counts a win as a full point for White", () => {
    expect(find(extractCandidates([gameOf("white", "1-0", "e4")]), "e4")?.score).toBe(1);
  });

  it("reads the same result as a loss for Black", () => {
    // 1-0 is a win for the White player and a loss for the Black one; scoring
    // off the bare result would invert every Black line.
    expect(find(extractCandidates([gameOf("black", "1-0", "e4")]), "e4")?.score).toBe(0);
  });

  it("averages across games", () => {
    const candidates = extractCandidates([
      gameOf("white", "1-0", "e4"),
      gameOf("white", "0-1", "e4"),
    ]);

    expect(find(candidates, "e4")?.score).toBe(0.5);
  });

  it("surfaces a line with a poor record", () => {
    // The case extraction exists for: a move played often that has not been
    // working, which no single game reveals.
    const candidates = extractCandidates([
      gameOf("white", "0-1", "e4", "c5"),
      gameOf("white", "0-1", "e4", "c5"),
      gameOf("white", "1/2-1/2", "e4", "c5"),
    ]);

    const c5 = find(candidates, "c5");
    expect(c5?.played).toBe(3);
    expect(c5?.score).toBeCloseTo(1 / 6, 5);
  });

  describe("unfinished games", () => {
    it("counts the move but leaves it out of the average", () => {
      // Treating an unfinished game as a draw would drag every line's record
      // towards the middle.
      const candidates = extractCandidates([
        gameOf("white", "1-0", "e4"),
        gameOf("white", "*", "e4"),
      ]);

      const e4 = find(candidates, "e4");
      expect(e4?.played).toBe(2);
      expect(e4?.scored).toBe(1);
      expect(e4?.score).toBe(1);
    });

    it("reports no scored games when every game is unfinished", () => {
      const e4 = find(extractCandidates([gameOf("white", "*", "e4")]), "e4");

      expect(e4?.played).toBe(1);
      expect(e4?.scored).toBe(0);
    });
  });
});

describe("whose decision a move is", () => {
  it("marks the owner's own choice", () => {
    const candidates = extractCandidates([gameOf("white", "1-0", "e4", "e5")]);

    expect(find(candidates, "e4")?.ownMove).toBe(true);
  });

  it("marks a move the owner faced", () => {
    const candidates = extractCandidates([gameOf("white", "1-0", "e4", "e5")]);

    expect(find(candidates, "e5")?.ownMove).toBe(false);
  });

  it("reads it the other way round for the Black repertoire", () => {
    const candidates = extractCandidates([gameOf("black", "0-1", "e4", "e5")]);

    expect(find(candidates, "e4")?.ownMove).toBe(false);
    expect(find(candidates, "e5")?.ownMove).toBe(true);
  });
});

describe("depth", () => {
  it("stops at the ply limit", () => {
    const candidates = extractCandidates(
      [gameOf("white", "1-0", "e4", "e5", "Nf3", "Nc6", "Bb5")],
      { maxPly: 3 },
    );

    expect(candidates.map((c) => c.san)).toEqual(["e4", "e5", "Nf3"]);
  });

  it("reports the shallowest ply a move was seen at", () => {
    const candidates = extractCandidates([gameOf("white", "1-0", "e4", "e5", "Nf3")]);

    expect(find(candidates, "e4")?.ply).toBe(1);
    expect(find(candidates, "Nf3")?.ply).toBe(3);
  });

  it("handles a game with no moves", () => {
    expect(extractCandidates([gameOf("white", "1-0")])).toEqual([]);
  });

  it("handles no games at all", () => {
    expect(extractCandidates([])).toEqual([]);
  });
});

describe("ordering", () => {
  it("puts the shallowest moves first, then the most played", () => {
    const candidates = extractCandidates([
      gameOf("white", "1-0", "e4", "e5"),
      gameOf("white", "1-0", "e4", "c5"),
      gameOf("white", "1-0", "d4"),
    ]);

    // 1.e4 twice, then 1.d4 once, then the replies a ply deeper.
    expect(candidates.map((c) => c.san)).toEqual(["e4", "d4", "c5", "e5"]);
  });
});
