"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { uciFromSan } from "@/core/chess/legal-moves";
import type { Color } from "@/core/domain/game";
import type { OpeningCard } from "@/core/domain/training-card";
import { formatLine } from "@/core/chess/format-line";
import {
  compareNewOpenings,
  judgeOpeningMove,
  type OpeningVerdict,
} from "@/core/training/opening-cards";
import { Button } from "@/components/ui/button";
import { getCards } from "@/persistence/repositories/training-repository";
import { syncOpeningCards } from "../sync-opening-cards";
import { TrainingDeck } from "./training-deck";
import { numbered, TrainingSession, type Answer } from "./training-session";

function Move({ card, san }: { card: OpeningCard; san: string }) {
  return <span className="text-foreground font-medium">{numbered(card.fen, san)}</span>;
}

/** "2. Nf3", or "2. Nf3 or 2. c3" when there is more than one. */
function Answers({ card, sans }: { card: OpeningCard; sans: readonly string[] }) {
  return sans.map((san, index) => (
    <span key={san}>
      {index > 0 ? " or " : null}
      <Move card={card} san={san} />
    </span>
  ));
}

function toAnswer(card: OpeningCard, verdict: OpeningVerdict): Answer {
  const [main, ...others] = card.answers;

  if (verdict.outcome === "main") {
    return {
      correct: true,
      message: (
        <>
          <Move card={card} san={verdict.san} /> — your main line.
        </>
      ),
      solutionUci: null,
      playedSymbol: null,
    };
  }

  if (verdict.outcome === "alternative") {
    return {
      correct: true,
      message: (
        <>
          <Move card={card} san={verdict.san} /> is in your repertoire. Your main line is{" "}
          <Move card={card} san={main} />.
        </>
      ),
      solutionUci: null,
      playedSymbol: null,
    };
  }

  return {
    correct: false,
    message: (
      <>
        <Move card={card} san={verdict.san} /> is not in your repertoire. You play{" "}
        <Answers card={card} sans={[main, ...others]} />.
      </>
    ),
    solutionUci: uciFromSan(card.fen, main),
    playedSymbol: null,
  };
}

export interface OpeningTrainerProps {
  color: Color;
  /** Go to where the repertoire is edited, for an empty deck. */
  onEditRepertoire: () => void;
}

/**
 * Drill one repertoire: every position where the owner is to move, asking for
 * the prepared move.
 *
 * Judged against the repertoire, not the engine — the point is to know one's
 * own choices, and a sound move that is not one of them is not the answer.
 */
export function OpeningTrainer({ color, onEditRepertoire }: OpeningTrainerProps) {
  const [synced, setSynced] = useState(false);
  const [syncError, setSyncError] = useState(false);

  // The repertoire may have been edited since the last visit; the cards
  // follow it before anything is shown.
  useEffect(() => {
    let cancelled = false;
    syncOpeningCards().then(
      () => !cancelled && setSynced(true),
      () => {
        if (cancelled) return;
        setSyncError(true);
        setSynced(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = useLiveQuery(
    async () => (await getCards("opening")).filter((card) => card.color === color),
    [color],
  );

  return (
    <div className="flex flex-col gap-6">
      <TrainingDeck
        // One deck per side: switching colour starts from that side's overview.
        key={color}
        cards={synced ? cards : undefined}
        newOrder={compareNewOpenings}
        intro={
          <p>
            Every position in your {color} repertoire where you are to move. Play the move you
            prepared; positions you know come back less and less often.
          </p>
        }
        empty={
          <div className="border-border flex flex-col gap-2 rounded-md border border-dashed p-6 text-sm">
            <p className="font-medium">Nothing to train for {color} yet</p>
            <p className="text-muted-foreground">
              Every move you prepare for yourself in your {color} repertoire becomes a position
              to train.
            </p>
            <div>
              <Button variant="outline" size="sm" onClick={onEditRepertoire}>
                Build your repertoire
              </Button>
            </div>
          </div>
        }
        session={(queue, onFinish) => (
          <TrainingSession
            cards={queue}
            onFinish={onFinish}
            judge={async (card, move) => toAnswer(card, judgeOpeningMove(card, move))}
            prompt={(card) => (
              <div className="flex flex-col gap-1">
                <p className="text-foreground">
                  {card.line.length > 0 ? formatLine(card.line) : "The starting position"}
                </p>
                <p>
                  What does your repertoire play here?
                  {card.answers.length > 1
                    ? ` You have ${card.answers.length} moves prepared; any of them counts.`
                    : null}
                </p>
              </div>
            )}
          />
        )}
      />

      {syncError ? (
        <p className="text-destructive text-sm" role="alert">
          Recent changes to your repertoire could not be brought into training. Reload the page
          to try again.
        </p>
      ) : null}
    </div>
  );
}
