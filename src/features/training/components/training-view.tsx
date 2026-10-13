"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { compareNewMistakes } from "@/core/training/mistake-cards";
import { Button } from "@/components/ui/button";
import { useBackgroundAnalysis } from "@/features/analysis/background/analysis-provider";
import { getCards } from "@/persistence/repositories/training-repository";
import { syncMistakeCards } from "../sync-mistake-cards";
import { MistakeSession } from "./mistake-session";
import { TrainingDeck } from "./training-deck";

/** The tactics trainer: the owner's own mistakes, found by the analysis. */
export function TrainingView() {
  const { state: background } = useBackgroundAnalysis();
  const cards = useLiveQuery(() => getCards("mistake"));
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

  return (
    <div className="flex flex-col gap-6">
      <TrainingDeck
        cards={cards}
        newOrder={compareNewMistakes}
        intro={
          <p>
            Positions from your own games where you went wrong, brought back at growing
            intervals until you find the right move without thinking.
          </p>
        }
        empty={<EmptyState analysed={background.analysed} />}
        session={(queue, onFinish) => <MistakeSession cards={queue} onFinish={onFinish} />}
      />

      {syncError ? (
        <p className="text-destructive text-sm" role="alert">
          New positions from your analysed games could not be added. Reload the page to try
          again.
        </p>
      ) : null}
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
