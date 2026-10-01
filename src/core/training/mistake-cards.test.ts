import { describe, expect, it } from "vitest";
import { buildTimeline } from "@/core/chess/pgn/game-timeline";
import type { PositionKey } from "@/core/chess/position-key";
import type { EvaluationRecord } from "@/core/domain/evaluation";
import type { GameAnalysisRecord } from "@/core/domain/game-analysis";
import { compareNewMistakes, mistakeCards, type MistakeSource } from "./mistake-cards";

// 3...Nf6?? walks into 4.Qxf7#. Black should have played 3...g6.
const GAME = '[Event "T"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0';
const timeline = buildTimeline(GAME);
const keyAt = (ply: number) => timeline[ply].key;

function evaluation(key: PositionKey, bestUci: string): EvaluationRecord {
  return {
    key,
    depth: 14,
    multiPv: 1,
    lines: [{ multiPv: 1, depth: 14, score: { type: "cp", value: 40 }, moves: [bestUci] }],
    engine: "Stockfish",
    evaluatedAt: 1,
  };
}

function source(overrides: Partial<MistakeSource> = {}): MistakeSource {
  const side = {
    counts: { best: 3, good: 0, inaccuracy: 0, mistake: 0, blunder: 1 },
    averageCentipawnLoss: 300,
    missedMates: 0,
    missedWins: 0,
  };
  const analysis: GameAnalysisRecord = {
    gameId: 9,
    depth: 14,
    engine: "Stockfish",
    analysedAt: 1,
    plies: 7,
    unevaluatedPlies: 0,
    white: side,
    black: side,
    errors: [{ ply: 6, quality: "blunder" }],
  };

  return {
    gameId: 9,
    label: "Opp – Dony, Lukas, 2026",
    dateIso: "2026-05-24",
    playerColor: "black",
    analysis,
    positions: new Map(timeline.map((node) => [node.ply, { key: node.key, san: node.san }])),
    evaluations: new Map([[keyAt(5), evaluation(keyAt(5), "g7g6")]]),
    ...overrides,
  };
}

describe("mistakeCards", () => {
  it("turns an error into the position before it, with what was better", () => {
    const [card] = mistakeCards(source());

    expect(card).toMatchObject({
      kind: "mistake",
      positionKey: keyAt(5),
      playedSan: "Nf6",
      bestUci: "g7g6",
      bestSan: "g6",
      quality: "blunder",
      moveNumber: 3,
      gameId: 9,
    });
    expect(card.fen.startsWith(keyAt(5))).toBe(true);
    // Black to move in the position to solve.
    expect(card.fen.split(" ")[1]).toBe("b");
  });

  it("shows the opponent's move into the position", () => {
    // 3.Bc4 — the bishop's arrival is the whole point of the puzzle.
    expect(mistakeCards(source())[0].previousUci).toBe("f1c4");
  });

  it("names a card by the position and the move, not the game", () => {
    const [fromThisGame] = mistakeCards(source());
    const [fromAnother] = mistakeCards(source({ gameId: 42, label: "another game" }));

    expect(fromThisGame.id).toBe(fromAnother.id);
  });

  it("takes only the owner's own errors", () => {
    // The same blunder, but the owner had White: it is not theirs to learn.
    expect(mistakeCards(source({ playerColor: "white" }))).toEqual([]);
  });

  it("leaves inaccuracies out", () => {
    const base = source();
    const analysis = { ...base.analysis, errors: [{ ply: 6, quality: "inaccuracy" as const }] };

    expect(mistakeCards({ ...base, analysis })).toEqual([]);
  });

  it("skips a position it has no evaluation for, rather than guessing", () => {
    expect(mistakeCards(source({ evaluations: new Map() }))).toEqual([]);
  });

  it("skips a card whose better move is the one that was played", () => {
    // An evaluation from a different depth can disagree with the verdict; a
    // card whose answer is the move already made would be nonsense.
    const evaluations = new Map([[keyAt(5), evaluation(keyAt(5), "g8f6")]]);

    expect(mistakeCards(source({ evaluations }))).toEqual([]);
  });

  it("skips a best move that does not play in the position", () => {
    const evaluations = new Map([[keyAt(5), evaluation(keyAt(5), "a1a8")]]);

    expect(mistakeCards(source({ evaluations }))).toEqual([]);
  });
});

describe("compareNewMistakes", () => {
  it("puts blunders first, then the more recent game", () => {
    const cards = [
      { id: "old mistake", quality: "mistake" as const, dateIso: "2020-01-01" },
      { id: "new mistake", quality: "mistake" as const, dateIso: "2026-01-01" },
      { id: "old blunder", quality: "blunder" as const, dateIso: "2019-01-01" },
      { id: "new blunder", quality: "blunder" as const, dateIso: "2025-01-01" },
    ];

    expect(cards.sort(compareNewMistakes).map((card) => card.id)).toEqual([
      "new blunder",
      "old blunder",
      "new mistake",
      "old mistake",
    ]);
  });
});
