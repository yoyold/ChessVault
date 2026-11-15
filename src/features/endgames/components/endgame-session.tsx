"use client";

import { useRef, useState } from "react";
import type { EndgameCard } from "@/core/domain/training-card";
import { drillById } from "@/core/endgames/catalogue";
import { Button } from "@/components/ui/button";
import type { SessionResult } from "@/features/training/components/training-session";
import { recordReview } from "@/persistence/repositories/training-repository";
import { DrillPlayer } from "./drill-player";

/** Outside the component: it reads the clock, which render must not. */
function record(id: string, achieved: boolean) {
  return recordReview(id, achieved ? "good" : "again", Date.now());
}

/**
 * Work through the endgame drills that are due, one play-out each.
 *
 * Only the first attempt at a drill counts: starting it over after a failure
 * is practice, and must not turn a miss into a pass.
 */
export function EndgameSession({
  cards,
  onFinish,
}: {
  cards: readonly EndgameCard[];
  onFinish: (result: SessionResult) => void;
}) {
  const drills = cards.flatMap((card) => {
    const drill = drillById(card.drillId);
    return drill ? [{ card, drill }] : [];
  });

  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<SessionResult>({ solved: 0, missed: 0 });
  const recorded = useRef(new Set<string>());

  const current = drills[index];
  if (!current) return null;

  const last = index + 1 >= drills.length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm tabular-nums">
        Drill {index + 1} of {drills.length}
      </p>
      <DrillPlayer
        key={current.card.id}
        drill={current.drill}
        onResult={(outcome) => {
          if (recorded.current.has(current.card.id)) return;
          recorded.current.add(current.card.id);

          const achieved = outcome.result === "achieved";
          void record(current.card.id, achieved);
          setResult((counts) =>
            achieved
              ? { ...counts, solved: counts.solved + 1 }
              : { ...counts, missed: counts.missed + 1 },
          );
        }}
        doneActions={
          <Button size="sm" onClick={() => (last ? onFinish(result) : setIndex(index + 1))}>
            {last ? "Finish" : "Next drill"}
          </Button>
        }
      />
    </div>
  );
}
