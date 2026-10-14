import { Chess } from "chess.js";
import { sideToMoveOf, type PositionKey } from "@/core/chess/position-key";
import type { Color } from "@/core/domain/game";
import {
  isOwnerToMove,
  REPERTOIRE_ROOT,
  type RepertoireMove,
} from "@/core/domain/repertoire";
import { openingCardId, type OpeningCardContent } from "@/core/domain/training-card";

type PreparedMove = Pick<RepertoireMove, "fromKey" | "toKey" | "san" | "uci" | "priority">;

/**
 * Every decision in a repertoire, as cards to answer.
 *
 * One card per position where the owner is to move and has a move prepared;
 * the prepared moves are the answers. Opponent positions are not cards — the
 * owner does not choose there — but the lines through them lead to the next
 * card.
 *
 * Only positions reachable from the starting position count. A move stranded
 * by deleting the line before it is still stored until it is cleaned up, but
 * there is no way to reach it over the board, so it is nothing to train.
 *
 * Breadth-first, so each card carries the shortest line to its position — the
 * least to read before answering — and the cards come out shallowest first.
 */
export function openingCards(
  color: Color,
  moves: readonly PreparedMove[],
): OpeningCardContent[] {
  const byPosition = new Map<PositionKey, PreparedMove[]>();
  for (const move of moves) {
    const siblings = byPosition.get(move.fromKey) ?? [];
    siblings.push(move);
    byPosition.set(move.fromKey, siblings);
  }
  for (const siblings of byPosition.values()) {
    siblings.sort((a, b) => b.priority - a.priority || a.san.localeCompare(b.san));
  }

  const arrivedBy = new Map<PositionKey, PreparedMove>();
  const seen = new Set<PositionKey>([REPERTOIRE_ROOT]);
  const cards: OpeningCardContent[] = [];

  let frontier: PositionKey[] = [REPERTOIRE_ROOT];
  while (frontier.length > 0) {
    const next: PositionKey[] = [];

    for (const key of frontier) {
      const prepared = byPosition.get(key) ?? [];

      if (prepared.length > 0 && isOwnerToMove(color, sideToMoveOf(key))) {
        const line = lineTo(key, arrivedBy);
        cards.push({
          kind: "opening",
          id: openingCardId(color, key),
          color,
          // The real move number, so the line reads as it would be written.
          fen: `${key} 0 ${Math.floor(line.length / 2) + 1}`,
          positionKey: key,
          previousUci: arrivedBy.get(key)?.uci ?? null,
          line,
          answers: prepared.map((move) => move.san),
        });
      }

      for (const move of prepared) {
        if (seen.has(move.toKey)) continue;
        seen.add(move.toKey);
        arrivedBy.set(move.toKey, move);
        next.push(move.toKey);
      }
    }

    frontier = next;
  }

  return cards;
}

function lineTo(key: PositionKey, arrivedBy: ReadonlyMap<PositionKey, PreparedMove>): string[] {
  const line: string[] = [];
  for (let step = arrivedBy.get(key); step; step = arrivedBy.get(step.fromKey)) {
    line.push(step.san);
  }
  return line.reverse();
}

/** Shallower positions first: an opening is learned from its first move on. */
export function compareNewOpenings(
  a: Pick<OpeningCardContent, "line">,
  b: Pick<OpeningCardContent, "line">,
): number {
  return a.line.length - b.line.length;
}


export type OpeningVerdict =
  | { outcome: "main"; san: string }
  /** Prepared, but not the move marked as the main line. */
  | { outcome: "alternative"; san: string }
  | { outcome: "wrong"; san: string };

/**
 * Whether a move is what the repertoire plays here.
 *
 * Any prepared move is right: an alternative the owner chose to prepare is
 * part of the repertoire. Compared by SAN as the board writes it, the same
 * way the repertoire stores its moves.
 *
 * @throws If the move is not legal in the card's position.
 */
export function judgeOpeningMove(
  card: Pick<OpeningCardContent, "fen" | "answers">,
  move: { from: string; to: string; promotion?: string },
): OpeningVerdict {
  const { san } = new Chess(card.fen).move(move);

  if (san === card.answers[0]) return { outcome: "main", san };
  if (card.answers.includes(san)) return { outcome: "alternative", san };
  return { outcome: "wrong", san };
}
