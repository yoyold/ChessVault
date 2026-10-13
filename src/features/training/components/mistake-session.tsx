"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { MoveQuality } from "@/core/analysis/move-quality";
import type { MoveSymbol } from "@/core/analysis/move-symbols";
import type { MistakeCard } from "@/core/domain/training-card";
import { Button } from "@/components/ui/button";
import { useInteractiveEngine } from "@/features/analysis/background/analysis-provider";
import { judgeMove, type Verdict } from "../judge-move";
import { numbered, TrainingSession, type Answer, type SessionResult } from "./training-session";

const SYMBOL_FOR_WRONG: Record<MoveQuality, MoveSymbol | null> = {
  best: null,
  good: null,
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
};

function Move({ card, san }: { card: MistakeCard; san: string }) {
  return <span className="text-foreground font-medium">{numbered(card.fen, san)}</span>;
}

function toAnswer(card: MistakeCard, verdict: Verdict): Answer {
  if (verdict.outcome === "best") {
    return {
      correct: true,
      message: (
        <>
          <Move card={card} san={verdict.san} /> is the move.
        </>
      ),
      solutionUci: null,
      playedSymbol: "!",
    };
  }

  if (verdict.outcome === "also-good") {
    return {
      correct: true,
      message: (
        <>
          <Move card={card} san={verdict.san} /> works too. The engine preferred{" "}
          <Move card={card} san={card.bestSan} />.
        </>
      ),
      solutionUci: null,
      playedSymbol: "!",
    };
  }

  return {
    correct: false,
    message: (
      <>
        {verdict.san === card.playedSan ? (
          <>The same move as in the game. </>
        ) : verdict.quality === "inaccuracy" ? (
          <>
            <Move card={card} san={verdict.san} /> is better than the game, but not enough.{" "}
          </>
        ) : (
          <>
            <Move card={card} san={verdict.san} /> does not hold either.{" "}
          </>
        )}
        The move was <Move card={card} san={card.bestSan} />.
      </>
    ),
    solutionUci: card.bestUci,
    playedSymbol: SYMBOL_FOR_WRONG[verdict.quality],
  };
}

/** Positions from the owner's games where they went wrong, judged by the engine. */
export function MistakeSession({
  cards,
  onFinish,
}: {
  cards: readonly MistakeCard[];
  onFinish: (result: SessionResult) => void;
}) {
  // Held only while training, so the background analysis carries on while the
  // overview is open and pauses while the engine is needed to judge answers.
  const engine = useInteractiveEngine();

  return (
    <TrainingSession
      cards={cards}
      onFinish={onFinish}
      removable
      judge={async (card, move) => toAnswer(card, await judgeMove(engine, card, move))}
      prompt={(card) => (
        <p>
          In your game {card.gameLabel} you played <Move card={card} san={card.playedSan} />
          {card.quality === "blunder" ? " — a blunder." : " — a mistake."} Find a better move.
        </p>
      )}
      actions={(card) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/analysis/?game=${card.gameId}`}>
            <ExternalLink />
            Open the game
          </Link>
        </Button>
      )}
    />
  );
}
