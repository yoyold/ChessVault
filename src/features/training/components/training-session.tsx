"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Chess } from "chess.js";
import { Check, Loader2, Trash2, X } from "lucide-react";
import type { MoveSymbol } from "@/core/analysis/move-symbols";
import { Button } from "@/components/ui/button";
import { AnalysisBoard } from "@/features/analysis/components/analysis-board";
import { deleteCard, recordReview } from "@/persistence/repositories/training-repository";

/** What a session needs of a card, whatever kind it is. */
export interface SessionCard {
  id: string;
  /** The position to answer, with the side to move as the board's bottom side. */
  fen: string;
  /** The move into the position, shown on the board for context. */
  previousUci: string | null;
}

/** The judgement on one answer, as the session shows it. */
export interface Answer {
  correct: boolean;
  /** What to say about the move. */
  message: ReactNode;
  /** A right move to show after a wrong one, in coordinates. */
  solutionUci: string | null;
  /** The mark for the move played, on the square it landed on. */
  playedSymbol: MoveSymbol | null;
}

export interface SessionResult {
  /** Cards answered right the first time they came up in the session. */
  solved: number;
  /** Cards answered wrong the first time. */
  missed: number;
}

export interface TrainingSessionProps<Card extends SessionCard> {
  /** The cards to work through, in order. */
  cards: readonly Card[];
  onFinish: (result: SessionResult) => void;
  /**
   * Decide whether a move answers a card.
   *
   * May take a while — the engine may have to look — and may throw, in which
   * case the user is asked to try again.
   */
  judge: (card: Card, move: { from: string; to: string; promotion: string }) => Promise<Answer>;
  /** The task, below the side to move. */
  prompt: (card: Card) => ReactNode;
  /** Further actions on the card, beside the next button. */
  actions?: (card: Card) => ReactNode;
  /**
   * Whether the owner may delete cards here.
   *
   * Not for cards that are rebuilt from something else, which would only come
   * back on the next visit.
   */
  removable?: boolean;
}

type Phase =
  | { step: "ask"; error: string | null }
  | { step: "judging"; fen: string; uci: string }
  | {
      step: "answered";
      answer: Answer;
      fen: string;
      uci: string;
      /** For a wrong answer: whether the board shows the solution or the move played. */
      showSolution: boolean;
    };

const ASK: Phase = { step: "ask", error: null };

function afterMove(fen: string, uci: string): string {
  const board = new Chess(fen);
  board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return board.fen();
}

/** "3. Nf6" for White, "3… Nf6" for Black, as move numbers are written. */
export function numbered(fen: string, san: string): string {
  const [, side, , , , fullmove] = fen.split(" ");
  return `${fullmove}${side === "w" ? "." : "…"} ${san}`;
}

/**
 * Work through a queue of cards, one position at a time.
 *
 * Every answer is written as soon as it is judged, so leaving halfway keeps
 * what was done. A card answered wrong comes back once at the end of the
 * session — the scheduler has it due again shortly anyway, and getting it
 * right just after seeing the answer is part of learning it.
 *
 * What a card asks and how an answer is judged belong to its kind; the
 * session only runs the queue.
 */
export function TrainingSession<Card extends SessionCard>({
  cards,
  onFinish,
  judge,
  prompt,
  actions,
  removable = false,
}: TrainingSessionProps<Card>) {
  const [queue, setQueue] = useState<readonly Card[]>(cards);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>(ASK);
  const [result, setResult] = useState<SessionResult>({ solved: 0, missed: 0 });
  const seen = useRef(new Set<string>());

  // Identifies the card an answer belongs to, so a judgement arriving after
  // the user has moved on cannot land on the next card.
  const attempt = useRef(0);

  const card = queue[index];

  const advance = useCallback(
    (length: number) => {
      attempt.current += 1;
      if (index + 1 >= length) {
        onFinish(result);
        return;
      }
      setIndex(index + 1);
      setPhase(ASK);
    },
    [index, onFinish, result],
  );

  const next = useCallback(() => advance(queue.length), [advance, queue.length]);

  async function answer(move: { from: string; to: string; promotion: string }, fen: string, uci: string) {
    const token = ++attempt.current;
    setPhase({ step: "judging", fen, uci });

    let judged: Answer;
    try {
      judged = await judge(card, move);
    } catch {
      if (token === attempt.current) {
        setPhase({ step: "ask", error: "The move could not be checked. Try it again." });
      }
      return;
    }
    if (token !== attempt.current) return;

    await recordReview(card.id, judged.correct ? "good" : "again", Date.now());
    if (token !== attempt.current) return;

    if (!seen.current.has(card.id)) {
      seen.current.add(card.id);
      setResult((counts) =>
        judged.correct
          ? { ...counts, solved: counts.solved + 1 }
          : { ...counts, missed: counts.missed + 1 },
      );
      if (!judged.correct) setQueue((current) => [...current, card]);
    }

    setPhase({ step: "answered", answer: judged, fen, uci, showSolution: !judged.correct });
  }

  function playMove(from: string, to: string): boolean {
    if (phase.step !== "ask") return false;

    const board = new Chess(card.fen);
    let uci: string;
    try {
      // Promotion defaults to a queen, as on the analysis board.
      const move = board.move({ from, to, promotion: "q" });
      uci = `${move.from}${move.to}${move.promotion ?? ""}`;
    } catch {
      return false;
    }

    void answer({ from, to, promotion: "q" }, board.fen(), uci);
    return true;
  }

  async function remove() {
    await deleteCard(card.id);
    // A removed card is not trained again, even if it was queued a second time.
    const rest = queue.filter((queued, position) => position <= index || queued.id !== card.id);
    setQueue(rest);
    advance(rest.length);
  }

  useEffect(() => {
    if (phase.step !== "answered") return;

    function onKey(event: KeyboardEvent) {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target instanceof HTMLElement && event.target.closest("button, a, input")) return;
      event.preventDefault();
      next();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase.step, next]);

  if (!card) return null;

  const orientation = card.fen.split(" ")[1] === "w" ? "white" : "black";

  let board: { fen: string; lastMoveUci: string | null; symbol: MoveSymbol | null };
  if (phase.step === "ask") {
    board = { fen: card.fen, lastMoveUci: card.previousUci, symbol: null };
  } else if (phase.step === "judging") {
    board = { fen: phase.fen, lastMoveUci: phase.uci, symbol: null };
  } else if (phase.showSolution && phase.answer.solutionUci) {
    const uci = phase.answer.solutionUci;
    board = { fen: afterMove(card.fen, uci), lastMoveUci: uci, symbol: "!" };
  } else {
    board = { fen: phase.fen, lastMoveUci: phase.uci, symbol: phase.answer.playedSymbol };
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {/* Fits the screen height on a desktop and takes the full width on a
          phone. A fixed width rather than a cap: in a row with the text beside
          it, a capped board would shrink to whatever the text left over. */}
      <div className="w-full min-w-0 lg:w-[min(40rem,calc(100svh-14rem))] lg:shrink-0">
        <div className="border-border overflow-hidden rounded-md border-2">
          <AnalysisBoard
            fen={board.fen}
            orientation={orientation}
            lastMoveUci={board.lastMoveUci}
            moveSymbol={board.symbol}
            onMove={phase.step === "ask" ? playMove : undefined}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4 lg:max-w-sm">
        <p className="text-muted-foreground text-sm tabular-nums">
          Position {index + 1} of {queue.length}
        </p>

        <div className="flex flex-col gap-1">
          <p className="font-medium">{orientation === "white" ? "White" : "Black"} to move</p>
          <div className="text-muted-foreground text-sm">{prompt(card)}</div>
        </div>

        {phase.step === "ask" && phase.error ? (
          <p className="text-destructive text-sm" role="alert">
            {phase.error}
          </p>
        ) : null}

        {phase.step === "judging" ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Checking your move…
          </p>
        ) : null}

        {phase.step === "answered" ? (
          <div className="flex flex-col gap-2" role="status">
            <p className="flex items-start gap-2 text-sm">
              {phase.answer.correct ? (
                <Check className="text-outcome-win mt-0.5 size-4 shrink-0" aria-hidden />
              ) : (
                <X className="text-outcome-loss mt-0.5 size-4 shrink-0" aria-hidden />
              )}
              <span>{phase.answer.message}</span>
            </p>
            {!phase.answer.correct && phase.answer.solutionUci ? (
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPhase({ ...phase, showSolution: !phase.showSolution })}
                >
                  {phase.showSolution ? "Show my move" : "Show the solution"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {phase.step === "answered" ? (
            <Button onClick={next} autoFocus>
              {index + 1 >= queue.length ? "Finish" : "Next position"}
            </Button>
          ) : null}
          {actions?.(card)}
          {removable ? (
            <Button variant="ghost" size="sm" onClick={() => void remove()}>
              <Trash2 />
              Remove card
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
