"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import type { ColourSummary } from "@/core/analysis/game-report";
import { recentForm } from "@/core/statistics/form";
import { OutcomeBar, OutcomeCounts, ScorePercent } from "@/components/outcome-bar";
import { ResultBadge } from "@/components/result-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getRecentGames } from "@/persistence/repositories/dashboard-repository";
import { cn } from "@/lib/utils";

/** Games the form is read over: enough to smooth out a single bad evening. */
const FORM_GAMES = 20;

/** Games listed individually. */
const LISTED_GAMES = 6;

const STREAK_LABEL = { win: "wins", draw: "draws", loss: "losses" } as const;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** The owner's errors in a game, worst first, or that there were none. */
function errorsLine(analysis: ColourSummary | null): string {
  if (!analysis) return "Not analysed";

  const { blunder, mistake } = analysis.counts;
  if (blunder === 0 && mistake === 0) return "No mistakes";

  return [
    blunder > 0 ? plural(blunder, "blunder") : null,
    mistake > 0 ? plural(mistake, "mistake") : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/** How the owner has been doing lately, and the games themselves. */
export function RecentGames() {
  const games = useLiveQuery(() => getRecentGames(FORM_GAMES));

  if (!games) return <Skeleton className="h-64 rounded-lg" />;
  if (games.length === 0) return null;

  const form = recentForm(games);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-medium">Recent form</h2>
        <Link
          href="/games/"
          className="text-muted-foreground hover:text-foreground text-sm underline-offset-2 hover:underline"
        >
          All games
        </Link>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Last {plural(games.length, "game")}</span>
          <span className="flex items-baseline gap-3">
            <OutcomeCounts tally={form.tally} />
            <ScorePercent tally={form.tally} className="font-medium" />
          </span>
        </div>
        <OutcomeBar tally={form.tally} />

        {form.rating !== null || form.streak ? (
          <p className="text-muted-foreground text-sm">
            {form.rating !== null ? (
              <>
                Rating <span className="text-foreground tabular-nums">{form.rating}</span>
                {form.ratingChange !== null && form.ratingChange !== 0 ? (
                  <span className="tabular-nums">
                    {" "}
                    ({form.ratingChange > 0 ? "+" : "−"}
                    {Math.abs(form.ratingChange)})
                  </span>
                ) : null}
              </>
            ) : null}
            {form.rating !== null && form.streak ? " · " : null}
            {form.streak
              ? `${form.streak.games} ${STREAK_LABEL[form.streak.outcome]} in a row`
              : null}
          </p>
        ) : null}
      </div>

      <ul className="divide-border flex flex-col divide-y rounded-lg border">
        {games.slice(0, LISTED_GAMES).map((game) => (
          <li key={game.id}>
            <Link
              href={`/analysis/?game=${game.id}`}
              className="hover:bg-accent/50 flex items-center gap-3 p-3 transition-colors"
            >
              <ResultBadge result={game.result} playerColor={game.playerColor} className="w-12" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  vs {game.opponent || "?"}
                  {game.opponentElo ? (
                    <span className="text-muted-foreground font-normal tabular-nums">
                      {" "}
                      ({game.opponentElo})
                    </span>
                  ) : null}
                </p>
                <p className="text-muted-foreground truncate text-xs tabular-nums">
                  {[
                    [game.eco, game.opening].filter(Boolean).join(" ") || "Opening unknown",
                    // ISO, as the game list and the analysis header write dates.
                    game.dateIso || "no date",
                  ].join(" · ")}
                </p>
              </div>
              <p
                className={cn(
                  "shrink-0 text-right text-xs",
                  game.analysis ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {errorsLine(game.analysis)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
