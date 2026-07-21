import type { Color, GameResult } from "@/core/domain/game";
import { outcomeFor, type GameOutcome } from "@/core/domain/game-outcome";
import { cn } from "@/lib/utils";

/** Figure-dash and one-half render the score the way chess literature prints it. */
const RESULT_LABEL: Record<GameResult, string> = {
  "1-0": "1–0",
  "0-1": "0–1",
  "1/2-1/2": "½–½",
  "*": "*",
};

/**
 * Full-strength tints, unlike the row backgrounds they replace.
 *
 * A badge occupies little space and sits against a neutral row, so it can carry
 * a saturated colour without competing with the text beside it — which is
 * exactly what tinting whole rows did.
 */
const OUTCOME_STYLE: Record<GameOutcome, string> = {
  win: "bg-result-win/70 text-foreground",
  draw: "bg-result-draw/70 text-foreground",
  loss: "bg-result-loss/70 text-foreground",
};

interface ResultBadgeProps {
  result: GameResult;
  /** Which side the database owner played; decides the colour. */
  playerColor: Color | null;
  className?: string;
}

/**
 * The game's score, coloured by how it turned out for the database owner.
 *
 * A game the owner did not play, or one left unfinished, gets no colour: the
 * same `0–1` is a win or a loss depending on which side they had, and for a
 * game between two other people it is neither.
 */
export function ResultBadge({ result, playerColor, className }: ResultBadgeProps) {
  const outcome = outcomeFor(playerColor, result);

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded px-2 py-0.5 text-sm font-medium tabular-nums",
        outcome ? OUTCOME_STYLE[outcome] : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {RESULT_LABEL[result] ?? result}
    </span>
  );
}
