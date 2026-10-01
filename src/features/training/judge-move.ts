import { Chess } from "chess.js";
import { assessMove, type MoveQuality } from "@/core/analysis/move-quality";
import type { Score } from "@/core/analysis/types";
import type { MistakeCardContent } from "@/core/domain/training-card";
import type { EngineService } from "@/features/analysis/engine/engine-service";

export type Verdict =
  /** The engine's own choice, or a mate. */
  | { outcome: "best"; san: string }
  /** A different move that keeps the position just as well. */
  | { outcome: "also-good"; san: string }
  | { outcome: "wrong"; san: string; quality: MoveQuality };

/**
 * How deep an alternative answer is checked.
 *
 * Shallower than the analysis that found the mistake: the question here is
 * only whether a move keeps the position, which is usually clear quickly, and
 * the answer should come while the move is still on the user's mind.
 */
export const JUDGE_DEPTH = 12;

const DRAW: Score = { type: "cp", value: 0 };

/**
 * Decide whether a move solves a card.
 *
 * The engine's choice is right, but it is not the only right answer: a
 * position often has several moves that hold, and marking a sound alternative
 * wrong would teach the engine's taste instead of the position. Any other move
 * is therefore searched, and accepted if it gives up no more than a move rated
 * "good" would — the same yardstick that called the original move a mistake.
 *
 * @throws If the move is not legal in the card's position.
 */
export async function judgeMove(
  engine: EngineService,
  card: MistakeCardContent,
  move: { from: string; to: string; promotion?: string },
): Promise<Verdict> {
  const board = new Chess(card.fen);
  const mover = board.turn();
  const played = board.move(move);
  const uci = `${played.from}${played.to}${played.promotion ?? ""}`;

  if (uci === card.bestUci || board.isCheckmate()) return { outcome: "best", san: played.san };

  // A position with no moves left has no line for the engine to report;
  // anything but mate there is a draw.
  const after = board.isGameOver()
    ? DRAW
    : ((await engine.analyse({ fen: board.fen(), depth: JUDGE_DEPTH, multiPv: 1 })).lines[0]
        ?.score ?? DRAW);

  const { quality } = assessMove({
    before: card.scoreBefore,
    after,
    moverColour: mover,
    wasBestMove: false,
  });

  return quality === "best" || quality === "good"
    ? { outcome: "also-good", san: played.san }
    : { outcome: "wrong", san: played.san, quality };
}
