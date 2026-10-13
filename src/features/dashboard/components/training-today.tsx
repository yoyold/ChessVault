"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import type { Color } from "@/core/domain/game";
import type { ReviewState } from "@/core/training/scheduler";
import { compareNewMistakes } from "@/core/training/mistake-cards";
import { compareNewOpenings } from "@/core/training/opening-cards";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBackgroundAnalysis } from "@/features/analysis/background/analysis-provider";
import { summariseDeck, type DeckSummary } from "@/features/training/components/training-deck";
import { syncMistakeCards } from "@/features/training/sync-mistake-cards";
import { syncOpeningCards } from "@/features/training/sync-opening-cards";
import { getCards } from "@/persistence/repositories/training-repository";

/** How often the counts are looked at again, as cards come due. */
const CLOCK_MS = 60 * 1000;

interface Deck {
  label: string;
  href: string;
  summary: DeckSummary<ReviewState>;
  total: number;
}

function openingDeck(color: Color, summary: DeckSummary<ReviewState>, total: number): Deck {
  return {
    label: color === "white" ? "White repertoire" : "Black repertoire",
    href: `/openings/?tab=train&color=${color}`,
    summary,
    total,
  };
}

/**
 * What is due across the trainers, with a way into each.
 *
 * The counts are the trainers' own — same queue, same daily allowance — so
 * the number here is the number the session starts with.
 */
export function TrainingToday() {
  const { state: background } = useBackgroundAnalysis();
  const [now, setNow] = useState(() => Date.now());

  // Bring the decks up to date: repertoire edits since the trainer was last
  // opened, and games analysed since — including while this page is open,
  // with the analysis running in the panel below.
  useEffect(() => {
    void syncOpeningCards().catch(() => undefined);
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void syncMistakeCards().catch(() => undefined);
  }, [background.analysed]);

  const cards = useLiveQuery(async () => {
    const [mistakes, openings] = await Promise.all([getCards("mistake"), getCards("opening")]);
    return { mistakes, openings };
  });

  if (!cards) return <Skeleton className="h-40 rounded-lg" />;

  const white = cards.openings.filter((card) => card.color === "white");
  const black = cards.openings.filter((card) => card.color === "black");
  const decks: Deck[] = [
    {
      label: "Tactics",
      href: "/tactics/",
      summary: summariseDeck(cards.mistakes, now, compareNewMistakes),
      total: cards.mistakes.length,
    },
    openingDeck("white", summariseDeck(white, now, compareNewOpenings), white.length),
    openingDeck("black", summariseDeck(black, now, compareNewOpenings), black.length),
  ].filter((deck) => deck.total > 0);

  const due = decks.reduce((sum, deck) => sum + deck.summary.queue.length, 0);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-medium">Training today</h2>
        {decks.length > 0 ? (
          <span className="text-muted-foreground text-sm tabular-nums">
            {due === 0 ? "All done" : `${due} position${due === 1 ? "" : "s"}`}
          </span>
        ) : null}
      </div>

      {decks.length === 0 ? (
        <div className="text-muted-foreground flex flex-col gap-1 rounded-lg border border-dashed p-4 text-sm">
          <p>Nothing to train yet.</p>
          <p>
            Tactics positions come from the mistakes found when your games are analysed;
            opening positions from the moves you prepare in{" "}
            <Link href="/openings/" className="text-foreground underline underline-offset-2">
              Openings
            </Link>
            .
          </p>
        </div>
      ) : (
        <ul className="divide-border flex flex-col divide-y rounded-lg border">
          {decks.map((deck) => (
            <li key={deck.label} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{deck.label}</p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {deck.summary.queue.length === 0
                    ? deck.summary.waitingNew > 0
                      ? "Done for today"
                      : "Done for now"
                    : [
                        deck.summary.dueReviews > 0 ? `${deck.summary.dueReviews} to review` : null,
                        deck.summary.newToday > 0 ? `${deck.summary.newToday} new` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </p>
              </div>
              {deck.summary.queue.length > 0 ? (
                <Button size="sm" asChild>
                  <Link href={deck.href}>Train</Link>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
