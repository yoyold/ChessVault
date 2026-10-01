"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import type { TrainingCard } from "@/core/domain/training-card";
import { compareNewMistakes } from "@/core/training/mistake-cards";
import { buildQueue, isDue, isNew } from "@/core/training/scheduler";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBackgroundAnalysis } from "@/features/analysis/background/analysis-provider";
import { getCards } from "@/persistence/repositories/training-repository";
import { syncMistakeCards } from "../sync-mistake-cards";
import { TrainingSession, type SessionResult } from "./training-session";

/**
 * New positions introduced per day.
 *
 * Ten keeps a session to a few minutes once reviews start coming back, which
 * is what makes it a daily habit rather than a chore put off for a week.
 */
const NEW_PER_DAY = 10;

/** How often the overview looks again for cards that have come due. */
const CLOCK_MS = 60 * 1000;

export function TrainingView() {
  const { state: background } = useBackgroundAnalysis();
  const cards = useLiveQuery(() => getCards("mistake"));

  const [now, setNow] = useState(() => Date.now());
  const [session, setSession] = useState<{ cards: TrainingCard[]; startedAt: number } | null>(null);
  const [lastResult, setLastResult] = useState<SessionResult | null>(null);
  const [syncError, setSyncError] = useState(false);

  // Games analysed since the last visit — or while this page is open — become
  // cards straight away.
  useEffect(() => {
    let cancelled = false;
    syncMistakeCards().then(
      () => !cancelled && setSyncError(false),
      () => !cancelled && setSyncError(true),
    );
    return () => {
      cancelled = true;
    };
  }, [background.analysed]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const queue = cards
    ? buildQueue(cards, now, { newPerDay: NEW_PER_DAY, newOrder: compareNewMistakes })
    : [];

  const finish = useCallback((result: SessionResult) => {
    setSession(null);
    setLastResult(result);
    setNow(Date.now());
  }, []);

  if (session) {
    return <TrainingSession key={session.startedAt} cards={session.cards} onFinish={finish} />;
  }

  if (!cards) return <Skeleton className="h-40" />;

  const dueReviews = queue.filter((card) => !isNew(card)).length;
  const newToday = queue.length - dueReviews;
  const waitingNew = cards.filter(isNew).length - newToday;
  const learning = cards.filter((card) => !isNew(card) && !isDue(card, now)).length;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        Positions from your own games where you went wrong, brought back at growing intervals
        until you find the right move without thinking.
      </p>

      {lastResult ? (
        <p className="text-sm" role="status">
          Session done: {lastResult.solved} solved, {lastResult.missed} missed.
          {lastResult.missed > 0 ? " Missed positions come back in a few minutes." : null}
        </p>
      ) : null}

      {cards.length === 0 ? (
        <EmptyState analysed={background.analysed} />
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
                setSession({ cards: queue, startedAt: Date.now() });
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

      {syncError ? (
        <p className="text-destructive text-sm" role="alert">
          New positions from your analysed games could not be added. Reload the page to try
          again.
        </p>
      ) : null}
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

function EmptyState({ analysed }: { analysed: number }) {
  return (
    <div className="border-border flex flex-col gap-2 rounded-md border border-dashed p-6 text-sm">
      <p className="font-medium">No positions to train yet</p>
      <p className="text-muted-foreground">
        {analysed === 0
          ? "Positions come from the mistakes and blunders the engine finds in your games. Analyse your collection to collect them."
          : "None of your analysed games has a mistake of yours in it so far. More appear as further games are analysed."}
      </p>
      <div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/statistics/#move-quality">Analyse your games</Link>
        </Button>
      </div>
    </div>
  );
}
