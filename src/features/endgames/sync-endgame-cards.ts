import { endgameCardId } from "@/core/domain/training-card";
import { ENDGAME_DRILLS, type EndgameDrill } from "@/core/endgames/catalogue";
import {
  replaceEndgameCards,
  type ReplaceResult,
} from "@/persistence/repositories/training-repository";

/**
 * Bring the endgame cards in line with the catalogue: one card per drill.
 *
 * The catalogue ships with the app, so this only changes anything when an
 * update adds, changes or retires a drill.
 */
export function syncEndgameCards(
  now: number = Date.now(),
  drills: readonly EndgameDrill[] = ENDGAME_DRILLS,
): Promise<ReplaceResult> {
  return replaceEndgameCards(
    drills.map((drill) => ({
      kind: "endgame",
      id: endgameCardId(drill.id),
      drillId: drill.id,
      fen: drill.fen,
      goal: drill.goal,
    })),
    now,
  );
}
