"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { EndgameCard } from "@/core/domain/training-card";
import {
  CATEGORY_LABELS,
  compareNewDrills,
  describeGoal,
  ENDGAME_DRILLS,
  type EndgameCategory,
  type EndgameDrill,
} from "@/core/endgames/catalogue";
import { isDue, isNew } from "@/core/training/scheduler";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrainingDeck } from "@/features/training/components/training-deck";
import { getCards } from "@/persistence/repositories/training-repository";
import { ENDGAME_NEW_PER_DAY } from "../endgame-deck";
import { syncEndgameCards } from "../sync-endgame-cards";
import { DrillPlayer } from "./drill-player";
import { EndgameSession } from "./endgame-session";

const DAY_MS = 24 * 60 * 60 * 1000;

const CATEGORIES = Object.keys(CATEGORY_LABELS) as EndgameCategory[];

/** Where a drill stands for the owner, in a few words. */
function standing(card: EndgameCard | undefined, now: number): string {
  if (!card || isNew(card)) return "New";
  if (isDue(card, now)) return "Due";
  const days = Math.max(1, Math.round((card.due - now) / DAY_MS));
  return `Again in ${days} day${days === 1 ? "" : "s"}`;
}

/**
 * The endgame trainer: drills due today, run as a session, and the whole
 * catalogue to practise any drill freely.
 */
export function EndgamesView() {
  const [synced, setSynced] = useState(false);
  const [practising, setPractising] = useState<EndgameDrill | null>(null);
  const [now] = useState(() => Date.now());

  // The catalogue ships with the app; an update may have added a drill.
  useEffect(() => {
    let cancelled = false;
    const done = () => !cancelled && setSynced(true);
    syncEndgameCards().then(done, done);
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = useLiveQuery(() => getCards("endgame"));

  if (practising) {
    return (
      <div className="flex flex-col gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={() => setPractising(null)}>
            Back to the drills
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          Free practice: this attempt does not change when the drill comes up again.
        </p>
        <DrillPlayer key={practising.id} drill={practising} />
      </div>
    );
  }

  if (!synced || !cards) return <Skeleton className="h-64" />;

  const byDrill = new Map(cards.map((card) => [card.drillId, card]));

  return (
    <TrainingDeck
      cards={cards}
      newOrder={compareNewDrills}
      newPerDay={ENDGAME_NEW_PER_DAY}
      noun="drill"
      intro={
        <p>
          The endgames every player needs, played out against the engine until you reach the
          goal without thinking. Drills you master come back less and less often.
        </p>
      }
      empty={null}
      session={(queue, onFinish) => <EndgameSession cards={queue} onFinish={onFinish} />}
      // The catalogue, for practising any drill; out of the way during a session.
      footer={
        <section className="mt-2 flex flex-col gap-4">
          <h2 className="font-medium">All drills</h2>
          {CATEGORIES.map((category) => {
            const drills = ENDGAME_DRILLS.filter((drill) => drill.category === category);
            if (drills.length === 0) return null;
            return (
              <div key={category} className="flex flex-col gap-2">
                <h3 className="text-muted-foreground text-sm">{CATEGORY_LABELS[category]}</h3>
                <ul className="divide-border flex flex-col divide-y rounded-lg border">
                  {drills.map((drill) => (
                    <li key={drill.id} className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{drill.title}</p>
                        <p className="text-muted-foreground text-xs">
                          {describeGoal(drill.goal)}
                          <span aria-label={`Difficulty ${drill.level} of 3`} className="ml-2">
                            {"●".repeat(drill.level)}
                            <span className="opacity-30">{"●".repeat(3 - drill.level)}</span>
                          </span>
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {standing(byDrill.get(drill.id), now)}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => setPractising(drill)}
                      >
                        Practise
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      }
    />
  );
}
