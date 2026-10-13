import { openingCards } from "@/core/training/opening-cards";
import { getRepertoire } from "@/persistence/repositories/repertoire-repository";
import {
  replaceOpeningCards,
  type ReplaceResult,
} from "@/persistence/repositories/training-repository";

/**
 * Bring the opening cards in line with both repertoires.
 *
 * Done in full every time rather than incrementally: a repertoire holds
 * hundreds of moves, not millions, and edits anywhere in it — a deleted line,
 * a changed main move, a new transposition — can change which positions are
 * reachable and what their answers are.
 */
export async function syncOpeningCards(now: number = Date.now()): Promise<ReplaceResult> {
  const [white, black] = await Promise.all([getRepertoire("white"), getRepertoire("black")]);

  return replaceOpeningCards(
    [...openingCards("white", white), ...openingCards("black", black)],
    now,
  );
}
