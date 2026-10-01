import type { Color } from "@/core/domain/game";
import type { EvaluationRecord } from "@/core/domain/evaluation";
import type { GameAnalysisRecord } from "@/core/domain/game-analysis";
import { mistakeCardId, type MistakeCardContent } from "@/core/domain/training-card";
import { variationToSan } from "@/core/analysis/variation-notation";
import { uciFromSan } from "@/core/chess/legal-moves";
import type { PositionKey } from "@/core/chess/position-key";

/** What a game contributes to finding its training positions. */
export interface MistakeSource {
  gameId: number;
  label: string;
  dateIso: string;
  playerColor: Color;
  analysis: GameAnalysisRecord;
  /** The game's positions by ply: the position there, and the move that led to it. */
  positions: ReadonlyMap<number, { key: PositionKey; san: string | null }>;
  evaluations: ReadonlyMap<PositionKey, EvaluationRecord>;
}

/**
 * A full FEN from a position key.
 *
 * The key leaves out the move counters, which are not part of what makes a
 * position the same. A board needs them, so they are put back: the halfmove
 * clock as zero, which nothing here reads, and the move number the error was
 * made on, which the board shows.
 */
function fenFromKey(key: PositionKey, moveNumber: number): string {
  return `${key} 0 ${moveNumber}`;
}

/**
 * The positions in one game where the owner went wrong, as cards to solve.
 *
 * Mistakes and blunders only. An inaccuracy is often a matter of taste at the
 * depth these games are analysed to, and a card whose "right" answer is barely
 * better than what was played teaches nothing but the engine's preferences.
 *
 * A position is skipped, never guessed at, when what a card needs is missing:
 * no evaluation of the position, or one whose best move does not play.
 */
export function mistakeCards(source: MistakeSource): MistakeCardContent[] {
  const ownParity = source.playerColor === "white" ? 1 : 0;
  const cards: MistakeCardContent[] = [];

  for (const error of source.analysis.errors) {
    if (error.quality === "inaccuracy" || error.ply % 2 !== ownParity) continue;

    const before = source.positions.get(error.ply - 1);
    const played = source.positions.get(error.ply)?.san;
    if (!before || !played) continue;

    const best = source.evaluations.get(before.key)?.lines[0];
    const bestUci = best?.moves[0];
    if (!best || !bestUci) continue;

    const moveNumber = Math.ceil(error.ply / 2);
    const fen = fenFromKey(before.key, moveNumber);

    const [bestSan] = variationToSan(fen, [bestUci], 1);
    if (!bestSan || bestSan === played) continue;

    // The opponent's move into the position, shown on the board for context:
    // a puzzle without it hides what has just happened.
    const earlier = source.positions.get(error.ply - 2);
    const previousUci =
      earlier && before.san
        ? uciFromSan(fenFromKey(earlier.key, Math.ceil((error.ply - 1) / 2)), before.san)
        : null;

    cards.push({
      kind: "mistake",
      id: mistakeCardId(before.key, played),
      fen,
      positionKey: before.key,
      previousUci,
      playedSan: played,
      bestUci,
      bestSan,
      quality: error.quality,
      scoreBefore: best.score,
      gameId: source.gameId,
      gameLabel: source.label,
      dateIso: source.dateIso,
      moveNumber,
    });
  }

  return cards;
}

/**
 * The order new mistake cards are introduced in: blunders before mistakes,
 * and within each, the more recent game first.
 *
 * A blunder is the bigger lesson, and a recent game reflects how the owner
 * plays now — a slip from years ago may long since have been grown out of.
 */
export function compareNewMistakes(
  a: Pick<MistakeCardContent, "quality" | "dateIso">,
  b: Pick<MistakeCardContent, "quality" | "dateIso">,
): number {
  if (a.quality !== b.quality) return a.quality === "blunder" ? -1 : 1;
  return b.dateIso.localeCompare(a.dateIso);
}
