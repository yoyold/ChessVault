import type { ErrorQuality, GameAnalysisRecord } from "@/core/domain/game-analysis";
import type { GameReport } from "./game-report";
import type { MoveQuality } from "./move-quality";

const ERRORS: ReadonlySet<MoveQuality> = new Set<MoveQuality>(["inaccuracy", "mistake", "blunder"]);

function isError(quality: MoveQuality): quality is ErrorQuality {
  return ERRORS.has(quality);
}

/**
 * Reduce a full game report to the record kept per game.
 *
 * The report holds every move; the record keeps only what the statistics add
 * up — each side's totals and where the errors fell. A good move needs no entry
 * of its own: it is already counted in its side's totals.
 */
export function summariseGameReport(
  report: GameReport,
  meta: Pick<GameAnalysisRecord, "gameId" | "depth" | "engine" | "analysedAt" | "plies">,
): GameAnalysisRecord {
  return {
    ...meta,
    unevaluatedPlies: report.unevaluatedPlies.length,
    white: report.white,
    black: report.black,
    errors: report.moves
      .filter((move) => isError(move.assessment.quality))
      .map((move) => ({ ply: move.ply, quality: move.assessment.quality as ErrorQuality })),
  };
}
