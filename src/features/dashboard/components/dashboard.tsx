"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { BackgroundAnalysisPanel } from "@/features/analysis/background/background-analysis-panel";
import { DatabaseStats } from "@/features/games/components/database-stats";
import { ImportCard } from "@/features/games/components/import-card";
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

  if (!counts) return <Skeleton className="h-64 rounded-lg" />;

  if (counts.games === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          Start by importing your games. Analysis, training and statistics all build on them.
        </p>
        <ImportCard />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {counts.owned === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm">
          None of your {counts.games.toLocaleString()} games is marked as yours yet.{" "}
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

      {counts.owned > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-medium">Engine analysis</h2>
          <p className="text-muted-foreground text-sm">
            Analysed games feed your move statistics and the tactics trainer.
          </p>
          <BackgroundAnalysisPanel />
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Collection</h2>
        <DatabaseStats />
        <ImportCard />
      </section>
    </div>
  );
}
