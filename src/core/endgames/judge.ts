import type { Chess } from "chess.js";
import type { Score } from "@/core/analysis/types";
import type { EndgameGoal } from "./catalogue";

/** How a drill ended, or null while it goes on. */
export type DrillOutcome = { result: "achieved" | "failed"; reason: string } | null;

/** A score at least this good, for the player, counts as a win in hand. */
const DECISIVE_CP = 500;
/** At or below this, a position that was won has become a draw at best. */
const WIN_GONE_CP = 100;
/** At or below this, a position that was to be held is lost. */
const LOST_CP = -400;

/** A score from White's side, turned to the player's. */
export function forPlayer(score: Score, player: "w" | "b"): Score {
  return player === "w" ? score : { type: score.type, value: -score.value };
}

function isDecisive(score: Score): boolean {
  return score.type === "mate" ? score.value > 0 : score.value >= DECISIVE_CP;
}

function isWinGone(score: Score): boolean {
  return score.type === "mate" ? score.value < 0 : score.value <= WIN_GONE_CP;
}

function isLost(score: Score): boolean {
  return score.type === "mate" ? score.value < 0 : score.value <= LOST_CP;
}

/** Why the rules call the game drawn. Only asked once they do. */
function drawReason(board: Chess): string {
  if (board.isStalemate()) return "Stalemate.";
  if (board.isInsufficientMaterial()) return "Not enough material left to mate.";
  if (board.isThreefoldRepetition()) return "The position repeated three times.";
  return "Fifty moves without a capture or a pawn move.";
}

/**
 * Judge the position after a move, by the rules of the game.
 *
 * A mate decides every drill. A draw by the rules is what a drawing drill is
 * after, and the end of any other.
 *
 * @param mover Who just moved: the player, or the engine defending.
 */
export function afterMove(goal: EndgameGoal, board: Chess, mover: "player" | "engine"): DrillOutcome {
  if (board.isCheckmate()) {
    return mover === "player"
      ? { result: "achieved", reason: "Checkmate." }
      : { result: "failed", reason: "You were mated." };
  }

  if (board.isDraw()) {
    const reason = drawReason(board);
    return goal.type === "draw"
      ? { result: "achieved", reason: `${reason} The draw is yours.` }
      : { result: "failed", reason: `${reason} The win is gone.` };
  }

  return null;
}

/**
 * Judge the position after the player's move, by the engine's score of it.
 *
 * The score is of the position with the defender to move, so it already
 * counts the best reply.
 *
 * - A promoting drill is done when the player has a queen and the win is
 *   still there; it is lost the moment the win is.
 * - A drawing drill is lost when the engine sees the position as lost.
 * - A mating drill ignores the score; see {@link EndgameGoal}.
 *
 * @param promoted Whether the player has promoted at any point in the drill.
 */
export function afterEvaluation(
  goal: EndgameGoal,
  score: Score,
  player: "w" | "b",
  promoted: boolean,
): DrillOutcome {
  const own = forPlayer(score, player);

  if (goal.type === "promote") {
    if (promoted && isDecisive(own)) {
      return { result: "achieved", reason: "Promoted, and the win is safe." };
    }
    if (isWinGone(own)) {
      return {
        result: "failed",
        reason: promoted ? "Promoted, but the win is gone." : "The win has slipped away.",
      };
    }
    return null;
  }

  if (goal.type === "draw" && isLost(own)) {
    return { result: "failed", reason: "The position is lost now." };
  }

  return null;
}

/** Judge a drawing drill by how long it has been held. */
export function afterHolding(goal: EndgameGoal, playerMoves: number): DrillOutcome {
  if (goal.type === "draw" && playerMoves >= goal.moves) {
    return { result: "achieved", reason: `Held for ${goal.moves} moves.` };
  }
  return null;
}
