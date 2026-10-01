"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Chess } from "chess.js";
import { Check, ExternalLink, Loader2, Trash2, X } from "lucide-react";
import type { MoveQuality } from "@/core/analysis/move-quality";
import type { MoveSymbol } from "@/core/analysis/move-symbols";
import type { TrainingCard } from "@/core/domain/training-card";
import { Button } from "@/components/ui/button";
import { AnalysisBoard } from "@/features/analysis/components/analysis-board";
import { useInteractiveEngine } from "@/features/analysis/background/analysis-provider";
import { deleteCard, recordReview } from "@/persistence/repositories/training-repository";
import { judgeMove, type Verdict } from "../judge-move";

type Phase =
  | { step: "ask"; error: string | null }
  | { step: "judging"; fen: string; uci: string }
  | {
      step: "answered";
      verdict: Verdict;
      fen: string;
      uci: string;
      /** For a wrong answer: whether the board shows the solution or the move played. */
      showSolution: boolean;
    };

const ASK: Phase = { step: "ask", error: null };

const SYMBOL_FOR_WRONG: Record<MoveQuality, MoveSymbol | null> = {
  best: null,
  good: null,
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
};

/** "3. Nf6" for White, "3… Nf6" for Black, as move numbers are written. */
function numbered(card: TrainingCard, san: string): string {
  const whiteToMove = card.fen.split(" ")[1] === "w";
  return `${card.moveNumber}${whiteToMove ? "." : "…"} ${san}`;
}

function afterMove(fen: string, uci: string): string {
  const board = new Chess(fen);
  board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return board.fen();
}

export interface SessionResult {
  /** Cards answered right the first time they came up in the session. */
  solved: number;
  /** Cards answered wrong the first time. */
  missed: number;
}

export interface TrainingSessionProps {
  /** The cards to work through, in order. */
  cards: readonly TrainingCard[];
  onFinish: (result: SessionResult) => void;
}

/**
 * Work through a queue of mistake cards, one position at a time.
 *
 * Every answer is written as soon as it is judged, so leaving halfway keeps
 * what was done. A card answered wrong comes back once at the end of the
 * session — the scheduler has it due again shortly anyway, and solving it
 * right after seeing the answer is part of learning it.
 */
export function TrainingSession({ cards, onFinish }: TrainingSessionProps) {
  // Held only while training, so the background analysis carries on while the
  // overview is open and pauses while the engine is needed to judge answers.
  const engine = useInteractiveEngine();

  const [queue, setQueue] = useState<readonly TrainingCard[]>(cards);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>(ASK);
  const [result, setResult] = useState<SessionResult>({ solved: 0, missed: 0 });
  const seen = useRef(new Set<string>());

  // Identifies the card an answer belongs to, so a judgement arriving after
  // the user has moved on cannot land on the next card.
  const attempt = useRef(0);

  const card = queue[index];

  const next = useCallback(() => {
    attempt.current += 1;
    if (index + 1 >= queue.length) {
      onFinish(result);
      return;
    }
    setIndex(index + 1);
    setPhase(ASK);
  }, [index, queue.length, onFinish, result]);

  async function answer(move: { from: string; to: string; promotion: string }, fen: string, uci: string) {
    const token = ++attempt.current;
    setPhase({ step: "judging", fen, uci });

    let verdict: Verdict;
    try {
      verdict = await judgeMove(engine, card, move);
    } catch {
      if (token === attempt.current) {
        setPhase({ step: "ask", error: "The move could not be checked. Try it again." });
      }
      return;
    }
    if (token !== attempt.current) return;

    const correct = verdict.outcome !== "wrong";
    await recordReview(card.id, correct ? "good" : "again", Date.now());
    if (token !== attempt.current) return;

    if (!seen.current.has(card.id)) {
      seen.current.add(card.id);
      setResult((counts) =>
        correct
          ? { ...counts, solved: counts.solved + 1 }
          : { ...counts, missed: counts.missed + 1 },
      );
      if (!correct) setQueue((current) => [...current, card]);
    }

    setPhase({ step: "answered", verdict, fen, uci, showSolution: !correct });
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
    attempt.current += 1;
    if (index + 1 >= rest.length) {
      onFinish(result);
      return;
    }
    setIndex(index + 1);
    setPhase(ASK);
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
  const solutionFen = afterMove(card.fen, card.bestUci);

  let board: { fen: string; lastMoveUci: string | null; symbol: MoveSymbol | null };
  if (phase.step === "ask") {
    board = { fen: card.fen, lastMoveUci: card.previousUci, symbol: null };
  } else if (phase.step === "judging") {
    board = { fen: phase.fen, lastMoveUci: phase.uci, symbol: null };
  } else if (phase.verdict.outcome === "wrong" && phase.showSolution) {
    board = { fen: solutionFen, lastMoveUci: card.bestUci, symbol: "!" };
  } else if (phase.verdict.outcome === "wrong") {
    board = {
      fen: phase.fen,
      lastMoveUci: phase.uci,
      symbol: SYMBOL_FOR_WRONG[phase.verdict.quality],
    };
  } else {
    board = { fen: phase.fen, lastMoveUci: phase.uci, symbol: "!" };
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
          <p className="font-medium">
            {orientation === "white" ? "White" : "Black"} to move
          </p>
          <p className="text-muted-foreground text-sm">
            In your game {card.gameLabel} you played{" "}
            <span className="text-foreground font-medium">{numbered(card, card.playedSan)}</span>
            {card.quality === "blunder" ? " — a blunder." : " — a mistake."} Find a better move.
          </p>
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
          <Feedback
            card={card}
            verdict={phase.verdict}
            showSolution={phase.showSolution}
            onToggle={() => setPhase({ ...phase, showSolution: !phase.showSolution })}
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {phase.step === "answered" ? (
            <Button onClick={next} autoFocus>
              {index + 1 >= queue.length ? "Finish" : "Next position"}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/analysis/?game=${card.gameId}`}>
              <ExternalLink />
              Open the game
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void remove()}>
            <Trash2 />
            Remove card
          </Button>
        </div>
      </div>
    </div>
  );
}

function Feedback({
  card,
  verdict,
  showSolution,
  onToggle,
}: {
  card: TrainingCard;
  verdict: Verdict;
  showSolution: boolean;
  onToggle: () => void;
}) {
  if (verdict.outcome === "best") {
    return (
      <p className="flex items-start gap-2 text-sm" role="status">
        <Check className="text-outcome-win mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <span className="font-medium">{numbered(card, verdict.san)}</span> is the move.
        </span>
      </p>
    );
  }

  if (verdict.outcome === "also-good") {
    return (
      <p className="flex items-start gap-2 text-sm" role="status">
        <Check className="text-outcome-win mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <span className="font-medium">{numbered(card, verdict.san)}</span> works too. The
          engine preferred <span className="font-medium">{numbered(card, card.bestSan)}</span>.
        </span>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2" role="status">
      <p className="flex items-start gap-2 text-sm">
        <X className="text-outcome-loss mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          {verdict.san === card.playedSan ? (
            <>The same move as in the game. </>
          ) : verdict.quality === "inaccuracy" ? (
            <>
              <span className="font-medium">{numbered(card, verdict.san)}</span> is better than
              the game, but not enough.{" "}
            </>
          ) : (
            <>
              <span className="font-medium">{numbered(card, verdict.san)}</span> does not hold
              either.{" "}
            </>
          )}
          The move was <span className="font-medium">{numbered(card, card.bestSan)}</span>.
        </span>
      </p>
      <div>
        <Button variant="outline" size="sm" onClick={onToggle}>
          {showSolution ? "Show my move" : "Show the solution"}
        </Button>
      </div>
    </div>
  );
}
