"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/persistence/db";
import { Skeleton } from "@/components/ui/skeleton";

interface Stat {
  label: string;
  value: number;
  hint: string;
}

/**
 * Live counts of what the database holds.
 *
 * `useLiveQuery` re-runs whenever the underlying tables change, so an import
 * updates these without any explicit invalidation.
 */
export function DatabaseStats() {
  const stats = useLiveQuery<Stat[] | undefined>(async () => {
    const [games, positions, occurrences] = await Promise.all([
      db.games.count(),
      db.positions.count(),
      db.gamePositions.count(),
    ]);

    return [
      { label: "Games", value: games, hint: "imported into the database" },
      {
        label: "Unique positions",
        value: positions,
        hint: "distinct positions across all games",
      },
      {
        label: "Position occurrences",
        value: occurrences,
        hint: "links between games and positions",
      },
    ];
  });

  if (!stats) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-lg border p-4">
          <div className="text-2xl font-semibold tabular-nums">
            {stat.value.toLocaleString()}
          </div>
          <div className="mt-1 text-sm font-medium">{stat.label}</div>
          <div className="text-muted-foreground text-xs">{stat.hint}</div>
        </div>
      ))}
    </div>
  );
}
