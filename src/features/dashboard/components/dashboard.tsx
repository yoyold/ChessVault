"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { BackgroundAnalysisPanel } from "@/features/analysis/background/background-analysis-panel";
import { useBackgroundAnalysis } from "@/features/analysis/background/analysis-provider";
import { DatabaseStats } from "@/features/games/components/database-stats";
import { ImportCard } from "@/features/games/components/import-card";
import { useSettings } from "@/features/shell/use-settings";
import { db } from "@/persistence/db";
import { RecentGames } from "./recent-games";
import { TrainingToday } from "./training-today";

/**
 * The start page: what to train today, how recent games went, and how far
 * the analysis has come — with importing kept at hand below.
 *
 * Before there are any games it is only the import, since every other part
 * would be empty.
 */
export function Dashboard() {
  const counts = useLiveQuery(async () => {
    const [games, owned] = await Promise.all([
      db.games.count(),
      db.games.where("playerColor").anyOf("white", "black").count(),
    ]);
    return { games, owned };
  });

  // Games arriving — an import running on this page — change how many there
  // are to analyse; the panel only counts when it appears.
  const { refresh } = useBackgroundAnalysis();
  const { analysisDepth } = useSettings();
  const owned = counts?.owned ?? 0;
  useEffect(() => {
    if (owned > 0) void refresh(analysisDepth);
  }, [owned, analysisDepth, refresh]);

  if (!counts) return <Skeleton className="h-64 rounded-lg" />;

  return (
    <div className="flex flex-col gap-3">
      {counts.games === 0 ? (
        <p className="text-muted-foreground text-sm">
          Start by importing your games. Analysis, training and statistics all build on them.
        </p>
      ) : (
        <Overview games={counts.games} owned={counts.owned} />
      )}

      {/* Always the last child, whether the database is empty or not. The
          first import fills the database while it runs, which switches the
          page from one layout to the other; kept in the same place, the card
          — and the import's progress and result in it — stays put. */}
      <ImportCard />
    </div>
  );
}

function Overview({ games, owned }: { games: number; owned: number }) {
  return (
    <div className="flex flex-col gap-8">
      {owned === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm">
          None of your {games.toLocaleString()} games is marked as yours yet.{" "}
          <Link href="/settings/" className="underline underline-offset-2">
            Set your name in Settings
          </Link>{" "}
          so ChessVault can tell your games apart and build your training and statistics.
        </p>
      ) : null}

      {/* Form gets the wider column: its rows carry names and openings, the
          training list only a label and a button. */}
      <div className="grid items-start gap-8 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <TrainingToday />
        </div>
        <div className="lg:col-span-3">
          <RecentGames />
        </div>
      </div>

      {owned > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-medium">Engine analysis</h2>
          <p className="text-muted-foreground text-sm">
            Analysed games feed your move statistics and the tactics trainer.
          </p>
          <BackgroundAnalysisPanel />
        </section>
      ) : null}

      {/* The import card follows directly below, as part of this section. */}
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Collection</h2>
        <DatabaseStats />
      </section>
    </div>
  );
}
