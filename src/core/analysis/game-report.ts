import type { TimelineNode } from "@/core/chess/pgn/game-timeline";
import type { PositionKey } from "@/core/chess/position-key";
import { assessMove, type MoveAssessment, type MoveQuality } from "./move-quality";
import type { Score } from "./types";

/** The evaluation available for a position, as far as the report is concerned. */
export interface EvaluatedPosition {
  score: Score;
  /** Engine's preferred move in UCI notation, if known. */
  bestMove: string | null;
}

export interface MoveReport {
  ply: number;
  san: string;
  moverColour: "w" | "b";
  assessment: MoveAssessment;
  /** Evaluation after the move, for the graph. */
  scoreAfter: Score;
  /** What the engine preferred instead, when the played move was not its choice. */
  betterMove: string | null;
}

export interface ColourSummary {
  counts: Record<MoveQuality, number>;
  /** Mean centipawn loss across the side's moves — the conventional accuracy measure. */
  averageCentipawnLoss: number;
  missedMates: number;
  missedWins: number;
}

export interface GameReport {
  moves: MoveReport[];
  white: ColourSummary;
  black: ColourSummary;
  /** Positions that had no evaluation, so the report is known to be partial. */
  unevaluatedPlies: number[];
}

function emptySummary(): ColourSummary {
  return {
    counts: { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
    averageCentipawnLoss: 0,
    missedMates: 0,
    missedWins: 0,
  };
}

/**
 * Turn a game and its position evaluations into a per-move report.
 *
 * Pure: it takes evaluations rather than fetching or producing them, so the
 * classification logic is testable without an engine or a database, and the
 * same function serves both a freshly analysed game and one being re-read from
 * storage.
 *
 * Moves whose surrounding positions are not both evaluated are skipped and
 * listed in `unevaluatedPlies`. Silently omitting them would make a partially
 * analysed game look cleanly played.
 */
export function buildGameReport(
  timeline: readonly TimelineNode[],
  evaluations: ReadonlyMap<PositionKey, EvaluatedPosition>,
): GameReport {
  const moves: MoveReport[] = [];
  const unevaluatedPlies: number[] = [];

  const centipawnLosses: Record<"w" | "b", number[]> = { w: [], b: [] };
  const white = emptySummary();
  const black = emptySummary();

  for (let index = 1; index < timeline.length; index += 1) {
    const previous = timeline[index - 1];
    const current = timeline[index];

    const before = evaluations.get(previous.key);
    const after = evaluations.get(current.key);

    if (!before || !after || current.san === null) {
      unevaluatedPlies.push(current.ply);
      continue;
    }

    const moverColour = previous.sideToMove;
    const wasBestMove =
      before.bestMove !== null && before.bestMove === current.uci;

    const assessment = assessMove({
      before: before.score,
      after: after.score,
      moverColour,
      wasBestMove,
    });

    moves.push({
      ply: current.ply,
      san: current.san,
      moverColour,
      assessment,
      scoreAfter: after.score,
      betterMove: wasBestMove ? null : before.bestMove,
    });

    const summary = moverColour === "w" ? white : black;
    summary.counts[assessment.quality] += 1;
    if (assessment.missedMate) summary.missedMates += 1;
    if (assessment.missedWin) summary.missedWins += 1;
    centipawnLosses[moverColour].push(assessment.centipawnLoss);
  }

  white.averageCentipawnLoss = mean(centipawnLosses.w);
  black.averageCentipawnLoss = mean(centipawnLosses.b);

  return { moves, white, black, unevaluatedPlies };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}
