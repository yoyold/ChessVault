"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { buildQueue, isDue, isNew, type ReviewState } from "@/core/training/scheduler";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { SessionResult } from "./training-session";

/**
 * New positions introduced per day, per deck.
 *
 * Ten keeps a session to a few minutes once reviews start coming back, which
 * is what makes it a daily habit rather than a chore put off for a week.
 */
export const NEW_PER_DAY = 10;

export interface DeckSummary<Card> {
  /** The cards to work through now: due reviews, then today's new ones. */
  queue: Card[];
  dueReviews: number;
  newToday: number;
  /** Cards seen before and not yet due again. */
  learning: number;
  /** New cards beyond today's allowance. */
  waitingNew: number;
}

/** Where a deck stands at a moment, as the overview and the dashboard show it. */
export function summariseDeck<Card extends ReviewState>(
  cards: readonly Card[],
  now: number,
  newOrder: (a: Card, b: Card) => number,
): DeckSummary<Card> {
  const queue = buildQueue(cards, now, { newPerDay: NEW_PER_DAY, newOrder });
  const dueReviews = queue.filter((card) => !isNew(card)).length;
  const newToday = queue.length - dueReviews;

  return {
    queue,
    dueReviews,
    newToday,
    learning: cards.filter((card) => !isNew(card) && !isDue(card, now)).length,
    waitingNew: cards.filter(isNew).length - newToday,
  };
}

/** How often the overview looks again for cards that have come due. */
const CLOCK_MS = 60 * 1000;

export interface TrainingDeckProps<Card extends ReviewState> {
  /** Every card in the deck; undefined while loading. */
  cards: readonly Card[] | undefined;
  /** Which new cards to introduce first. */
  newOrder: (a: Card, b: Card) => number;
  /** What the deck is, above the figures. */
  intro: ReactNode;
  /** Shown instead of the figures when the deck has no cards. */
  empty: ReactNode;
  /** The session over a queue, until it calls back with its result. */
  session: (queue: Card[], onFinish: (result: SessionResult) => void) => ReactNode;
}

/**
 * A deck's overview — what is due, what is new, how far along — and the
 * sessions run from it.
 */
export function TrainingDeck<Card extends ReviewState>({
  cards,
  newOrder,
  intro,
  empty,
  session,
}: TrainingDeckProps<Card>) {
  const [now, setNow] = useState(() => Date.now());
  const [running, setRunning] = useState<{ queue: Card[]; startedAt: number } | null>(null);
  const [lastResult, setLastResult] = useState<SessionResult | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const finish = useCallback((result: SessionResult) => {
    setRunning(null);
    setLastResult(result);
    setNow(Date.now());
  }, []);

  if (running) {
    // Keyed so a new session never inherits the last one's place.
    return <div key={running.startedAt}>{session(running.queue, finish)}</div>;
  }

  if (!cards) return <Skeleton className="h-40" />;

  const { queue, dueReviews, newToday, learning, waitingNew } = summariseDeck(
    cards,
    now,
    newOrder,
  );

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="text-muted-foreground text-sm">{intro}</div>

      {lastResult ? (
        <p className="text-sm" role="status">
          Session done: {lastResult.solved} solved, {lastResult.missed} missed.
          {lastResult.missed > 0 ? " Missed positions come back in a few minutes." : null}
        </p>
      ) : null}

      {cards.length === 0 ? (
        empty
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Figure label="To review" value={dueReviews} />
            <Figure label="New today" value={newToday} />
            <Figure label="In progress" value={learning} />
            <Figure label="Not yet seen" value={waitingNew} />
          </dl>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={queue.length === 0}
              onClick={() => {
                setLastResult(null);
                setRunning({ queue, startedAt: Date.now() });
              }}
            >
              {queue.length === 0 ? "Nothing due" : `Train ${queue.length} positions`}
            </Button>
            {queue.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {waitingNew > 0
                  ? `Done for today. ${Math.min(waitingNew, NEW_PER_DAY)} new positions tomorrow.`
                  : "Done for now. Reviews come back as they fall due."}
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
