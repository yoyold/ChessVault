"use client";

import { useRef, useState, type ReactNode } from "react";
import { Chess } from "chess.js";
import { Check, Lightbulb, Loader2, RotateCcw, X } from "lucide-react";
import {
  CATEGORY_LABELS,
  describeGoal,
  type EndgameDrill,
} from "@/core/endgames/catalogue";
import {
  afterEvaluation,
  afterHolding,
  afterMove,
  type DrillOutcome,
} from "@/core/endgames/judge";
import { Button } from "@/components/ui/button";
import { AnalysisBoard } from "@/features/analysis/components/analysis-board";
import { useInteractiveEngine } from "@/features/analysis/background/analysis-provider";

/**
 * How deep the defending engine looks.
 *
 * Endgame positions are small, so this is quick, and deep enough that the
 * defence is stubborn and the score it reports can be trusted to tell a won
 * position from a drawn one.
 */
const DEFENCE_DEPTH = 16;

type Finished = NonNullable<DrillOutcome>;

type Status =
  | { step: "player"; error: string | null }
  | { step: "engine" }
  | { step: "done"; outcome: Finished };

export interface DrillPlayerProps {
  drill: EndgameDrill;
  /** Called each time the drill ends, with how. */
  onResult?: (outcome: Finished) => void;
  /** Actions offered once the drill has ended, beside starting over. */
  doneActions?: ReactNode;
}

/**
 * Play an endgame drill out against the engine.
 *
 * The engine defends: it answers every move with its best one. After each
 * move the rules are asked first — a mate or a draw ends any drill — then the
 * engine's score of the position, which already counts its best reply.
 */
export function DrillPlayer({ drill, onResult, doneActions }: DrillPlayerProps) {
  // The defence pauses the background analysis while the drill is open.
  const engine = useInteractiveEngine();

  // One board for the whole attempt, so threefold repetition can be seen.
  const board = useRef(new Chess(drill.fen));
  const promoted = useRef(false);
  // An answer arriving after the drill was started over belongs to nothing.
  const attempt = useRef(0);

  const player = drill.fen.split(" ")[1] === "w" ? "w" : "b";
  const [fen, setFen] = useState(drill.fen);
  const [lastMove, setLastMove] = useState<string | null>(null);
  const [playerMoves, setPlayerMoves] = useState(0);
  const [status, setStatus] = useState<Status>({ step: "player", error: null });
  const [showIdea, setShowIdea] = useState(false);

  function finish(outcome: Finished) {
    setStatus({ step: "done", outcome });
    onResult?.(outcome);
  }

  function show() {
    setFen(board.current.fen());
  }

  async function reply(movesSoFar: number) {
    const token = attempt.current;
    setStatus({ step: "engine" });

    let line;
    try {
      const analysis = await engine.analyse({
        fen: board.current.fen(),
        depth: DEFENCE_DEPTH,
        multiPv: 1,
      });
      line = analysis.lines[0];
    } catch {
      if (token === attempt.current) {
        setStatus({ step: "player", error: "The engine did not answer. Try the move again." });
      }
      return;
    }
    if (token !== attempt.current) return;

    const judged = line ? afterEvaluation(drill.goal, line.score, player, promoted.current) : null;
    if (judged) {
      finish(judged);
      return;
    }

    const uci = line?.moves[0];
    if (!uci) {
      setStatus({ step: "player", error: "The engine found no move. Try the move again." });
      return;
    }
    board.current.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    setLastMove(uci);
    show();

    const outcome = afterMove(drill.goal, board.current, "engine") ?? afterHolding(drill.goal, movesSoFar);
    if (outcome) finish(outcome);
    else setStatus({ step: "player", error: null });
  }

  function playMove(from: string, to: string): boolean {
    if (status.step !== "player") return false;

    let move;
    try {
      // Promotion defaults to a queen, as on every board in the app.
      move = board.current.move({ from, to, promotion: "q" });
    } catch {
      return false;
    }
    if (move.promotion) promoted.current = true;

    setLastMove(`${move.from}${move.to}${move.promotion ?? ""}`);
    show();
    const movesSoFar = playerMoves + 1;
    setPlayerMoves(movesSoFar);

    const outcome = afterMove(drill.goal, board.current, "player");
    if (outcome) finish(outcome);
    else void reply(movesSoFar);
    return true;
  }

  function startOver() {
    attempt.current += 1;
    board.current = new Chess(drill.fen);
    promoted.current = false;
    setFen(drill.fen);
    setLastMove(null);
    setPlayerMoves(0);
    setStatus({ step: "player", error: null });
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="w-full min-w-0 lg:w-[min(40rem,calc(100svh-14rem))] lg:shrink-0">
        <div className="border-border overflow-hidden rounded-md border-2">
          <AnalysisBoard
            fen={fen}
            orientation={player === "w" ? "white" : "black"}
            lastMoveUci={lastMove}
            onMove={status.step === "player" ? playMove : undefined}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4 lg:max-w-sm">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs">{CATEGORY_LABELS[drill.category]}</p>
          <h2 className="text-lg font-medium">{drill.title}</h2>
          <p className="text-sm">
            You play {player === "w" ? "White" : "Black"}. {describeGoal(drill.goal)}
          </p>
          {drill.goal.type === "draw" && status.step !== "done" ? (
            <p className="text-muted-foreground text-sm tabular-nums">
              Held {playerMoves} of {drill.goal.moves} moves.
            </p>
          ) : null}
        </div>

        {status.step === "engine" ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            The engine is answering…
          </p>
        ) : null}

        {status.step === "player" && status.error ? (
          <p className="text-destructive text-sm" role="alert">
            {status.error}
          </p>
        ) : null}

        {status.step === "done" ? (
          <p className="flex items-start gap-2 text-sm" role="status">
            {status.outcome.result === "achieved" ? (
              <Check className="text-outcome-win mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <X className="text-outcome-loss mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            <span>
              <span className="font-medium">
                {status.outcome.result === "achieved" ? "Done. " : "Not this time. "}
              </span>
              {status.outcome.reason}
            </span>
          </p>
        ) : null}

        {showIdea ? (
          <p className="bg-muted rounded-md p-3 text-sm">{drill.idea}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {status.step === "done" ? doneActions : null}
          <Button variant="outline" size="sm" onClick={startOver}>
            <RotateCcw />
            Start over
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowIdea(!showIdea)}>
            <Lightbulb />
            {showIdea ? "Hide the idea" : "Show the idea"}
          </Button>
        </div>
      </div>
    </div>
  );
}
