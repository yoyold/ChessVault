"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import type { Color } from "@/core/domain/game";
import {
  buildStatistics,
  type Breakdown,
  type Period,
  type Statistics,
} from "@/core/statistics/statistics";
import { OutcomeCounts } from "@/components/outcome-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { loadStatisticsSource } from "@/persistence/repositories/statistics-repository";
import { cn } from "@/lib/utils";
import { BreakdownTable, type BreakdownRow } from "./breakdown-table";
import { RatingChart } from "./rating-chart";

const SELECT_CLASS = "border-input bg-background h-9 rounded-md border px-2 text-sm";

/** How many rows a long table shows before offering the rest. */
const PREVIEW_ROWS = 10;

const DAY = 24 * 60 * 60 * 1000;

function isoDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * The period a select value stands for.
 *
 * Years are offered from the data rather than as a fixed list, so every option
 * has games behind it.
 */
function periodFor(id: string): Period {
  if (id === "12m") return { from: isoDay(Date.now() - 365 * DAY) };
  if (id.startsWith("year:")) {
    const year = id.slice(5);
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  return {};
}

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

/**
 * Actual minus expected, in percentage points, signed.
 *
 * The sign carries the meaning; the colour only repeats it.
 */
function Difference({ breakdown }: { breakdown: Breakdown }) {
  const { actual, expected } = breakdown.rating;
  if (actual === null || expected === null) return <span className="text-muted-foreground">—</span>;

  const points = Math.round((actual - expected) * 100);

  return (
    <span
      className={cn(
        points > 0 && "text-emerald-700 dark:text-emerald-400",
        points < 0 && "text-red-700 dark:text-red-400",
      )}
      title={`Scored ${percent(actual)} where the ratings predicted ${percent(expected)}, over ${breakdown.rating.games} rated game${breakdown.rating.games === 1 ? "" : "s"}`}
    >
      {points > 0 ? "+" : points < 0 ? "−" : "±"}
      {Math.abs(points)}
    </span>
  );
}

function Performance({ breakdown }: { breakdown: Breakdown }) {
  const { performance, games } = breakdown.rating;
  if (performance === null) return <span className="text-muted-foreground">—</span>;

  return (
    <span title={`Over ${games} rated game${games === 1 ? "" : "s"}`}>{performance}</span>
  );
}

/** One headline figure: a label, the value, and what it rests on. */
function Tile({ label, value, detail }: { label: string; value: string; detail: React.ReactNode }) {
  return (
    <div className="bg-card flex flex-col gap-1 rounded-lg border p-4">
      <span className="text-muted-foreground text-sm">{label}</span>
      {/* Proportional figures: at this size equal-width digits look loose. */}
      <span className="text-3xl font-semibold">{value}</span>
      <span className="text-muted-foreground text-xs">{detail}</span>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-medium">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {children}
    </section>
  );
}

function ShowMore({
  shown,
  total,
  expanded,
  onToggle,
}: {
  shown: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (total <= PREVIEW_ROWS) return null;

  return (
    <Button variant="ghost" size="sm" className="self-start" onClick={onToggle}>
      {expanded ? "Show fewer" : `Show all ${total} `}
      {expanded ? null : <span className="text-muted-foreground">({total - shown} more)</span>}
    </Button>
  );
}

/**
 * How the owner's games have gone, broken down the ways that suggest what to
 * work on: by colour, by opponent strength, over time, by opening and by
 * tournament.
 *
 * Everything here is computed from results and ratings, which every game has.
 * Measures of move quality need an engine evaluation of every game and are not
 * shown until those exist — a figure resting on the few games that happen to
 * have been analysed would describe those games, not the player.
 */
export function StatisticsView() {
  const source = useLiveQuery(loadStatisticsSource);
  const [periodId, setPeriodId] = useState("all");
  const [openingColor, setOpeningColor] = useState<Color>("white");
  const [allOpenings, setAllOpenings] = useState(false);
  const [allEvents, setAllEvents] = useState(false);

  // Loaded once; switching the period only re-aggregates what is in memory.
  const allTime = useMemo(() => (source ? buildStatistics(source.games) : null), [source]);
  const stats = useMemo(
    () => (source ? buildStatistics(source.games, periodFor(periodId)) : null),
    [source, periodId],
  );

  if (!source || !allTime || !stats) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  if (source.games.length === 0) {
    return (
      <div className="text-muted-foreground max-w-prose rounded-lg border p-6 text-sm">
        {source.unattributed > 0 ? (
          <p>
            None of your {source.unattributed.toLocaleString()} games is attributed to you yet.
            Statistics are about the games you played, so add the names you play under in{" "}
            <Link href="/settings" className="text-foreground underline underline-offset-4">
              Settings
            </Link>
            .
          </p>
        ) : (
          <p>
            No games yet.{" "}
            <Link href="/" className="text-foreground underline underline-offset-4">
              Import your games
            </Link>{" "}
            to see how they have gone.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* One filter row, above everything it applies to. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <select
          className={SELECT_CLASS}
          value={periodId}
          aria-label="Period"
          onChange={(event) => setPeriodId(event.target.value)}
        >
          <option value="all">All time</option>
          <option value="12m">Last 12 months</option>
          {allTime.years.map((row) => (
            <option key={row.year} value={`year:${row.year}`}>
              {row.year}
            </option>
          ))}
        </select>

        <p className="text-muted-foreground text-sm">
          {stats.total.tally.games.toLocaleString()} game
          {stats.total.tally.games === 1 ? "" : "s"}
          {stats.undatedExcluded > 0
            ? ` · ${stats.undatedExcluded} without a date left out of this period`
            : ""}
          {source.unattributed > 0 ? (
            <>
              {" · "}
              {source.unattributed} not attributed to you (
              <Link href="/settings" className="underline underline-offset-4">
                names
              </Link>
              )
            </>
          ) : null}
        </p>
      </div>

      {stats.total.tally.games === 0 ? (
        <p className="text-muted-foreground text-sm">No games in this period.</p>
      ) : (
        <PeriodStatistics
          stats={stats}
          openingColor={openingColor}
          onOpeningColorChange={setOpeningColor}
          allOpenings={allOpenings}
          onAllOpeningsChange={setAllOpenings}
          allEvents={allEvents}
          onAllEventsChange={setAllEvents}
        />
      )}
    </div>
  );
}

function PeriodStatistics({
  stats,
  openingColor,
  onOpeningColorChange,
  allOpenings,
  onAllOpeningsChange,
  allEvents,
  onAllEventsChange,
}: {
  stats: Statistics;
  openingColor: Color;
  onOpeningColorChange: (color: Color) => void;
  allOpenings: boolean;
  onAllOpeningsChange: (all: boolean) => void;
  allEvents: boolean;
  onAllEventsChange: (all: boolean) => void;
}) {
  const { total } = stats;

  const colorRows: BreakdownRow[] = (["white", "black"] as const).map((color) => ({
    key: color,
    label: color === "white" ? "With White" : "With Black",
    breakdown: stats.byColor[color],
  }));

  const bandRows = stats.bands.map((row) => ({
    key: row.band,
    label: row.label,
    breakdown: row,
  }));
  const rated = stats.bands.reduce((sum, row) => sum + row.tally.games, 0);

  const openings = stats.openings.filter((row) => row.color === openingColor);
  const openingRows = (allOpenings ? openings : openings.slice(0, PREVIEW_ROWS)).map((row) => ({
    key: `${row.color}-${row.eco ?? "none"}`,
    label: (
      <span title={row.name ?? undefined}>
        <span className="font-medium">{row.eco ?? "No code"}</span>
        {row.name ? <span className="text-muted-foreground"> {row.name}</span> : null}
      </span>
    ),
    breakdown: row,
  }));

  const yearRows = stats.years.map((row) => ({ key: row.year, label: row.year, breakdown: row }));

  const eventRows = (allEvents ? stats.events : stats.events.slice(0, PREVIEW_ROWS)).map((row) => ({
    key: row.event,
    label: (
      <span title={row.event}>
        {row.event}
        {row.lastDate ? (
          <span className="text-muted-foreground"> {row.lastDate.slice(0, 4)}</span>
        ) : null}
      </span>
    ),
    breakdown: row,
  }));

  const performanceColumn = {
    header: "Perf.",
    hint: "Performance rating: the rating at which these results would have been exactly the expected ones",
    render: (row: BreakdownRow) => <Performance breakdown={row.breakdown} />,
  };

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Games"
          value={total.tally.games.toLocaleString()}
          detail={
            total.tally.scored === total.tally.games
              ? "all finished"
              : `${total.tally.scored.toLocaleString()} finished`
          }
        />
        <Tile
          label="Score"
          value={total.tally.scored === 0 ? "—" : percent(total.tally.score)}
          detail={
            <>
              <OutcomeCounts tally={total.tally} /> won, drawn, lost
            </>
          }
        />
        <Tile
          label="Performance rating"
          value={total.rating.performance === null ? "—" : String(total.rating.performance)}
          detail={
            total.rating.games === 0
              ? "needs games with both ratings"
              : `over ${total.rating.games} rated game${total.rating.games === 1 ? "" : "s"}`
          }
        />
        <Tile
          label="Average opponent"
          value={total.rating.averageOpponent === null ? "—" : String(total.rating.averageOpponent)}
          detail={
            total.rating.games === 0
              ? "no rated opponents"
              : `expected ${percent(total.rating.expected)}, scored ${percent(total.rating.actual)}`
          }
        />
      </div>

      <Section title="White and Black" description="The same record, split by the side you had.">
        <BreakdownTable rows={colorRows} labelHeader="Colour" extra={[performanceColumn]} />
      </Section>

      <Section
        title="Opponent strength"
        description={`How you score against stronger and weaker players, beside what the ratings predicted. ${rated} of ${total.tally.games} games have both ratings.`}
      >
        <BreakdownTable
          rows={bandRows}
          labelHeader="Opponent rated"
          extra={[
            {
              header: "Expected",
              hint: "The score the ratings predicted for these games",
              render: (row) => percent(row.breakdown.rating.expected),
            },
            {
              header: "+/−",
              hint: "Scored minus expected, in percentage points",
              render: (row) => <Difference breakdown={row.breakdown} />,
            },
          ]}
        />
      </Section>

      <Section title="Rating" description="Your own rating as recorded in your games.">
        <RatingChart points={stats.ratingHistory} />
      </Section>

      <Section title="By year" description="Whether the results are moving, and against whom.">
        <BreakdownTable
          rows={yearRows}
          labelHeader="Year"
          extra={[
            {
              header: "Avg. opp.",
              hint: "Average opponent rating",
              render: (row) => row.breakdown.rating.averageOpponent ?? "—",
            },
            performanceColumn,
          ]}
        />
      </Section>

      <Section
        title="Openings"
        description="By ECO code and the side you had, most played first. The same code is a different experience as White and as Black."
      >
        <div className="flex gap-1" role="group" aria-label="Colour">
          {(["white", "black"] as const).map((color) => (
            <Button
              key={color}
              size="sm"
              variant={openingColor === color ? "secondary" : "ghost"}
              aria-pressed={openingColor === color}
              onClick={() => onOpeningColorChange(color)}
            >
              As {color === "white" ? "White" : "Black"}
            </Button>
          ))}
        </div>
        {openings.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No games as {openingColor === "white" ? "White" : "Black"} in this period.
          </p>
        ) : (
          <>
            <BreakdownTable rows={openingRows} labelHeader="Opening" />
            <ShowMore
              shown={openingRows.length}
              total={openings.length}
              expanded={allOpenings}
              onToggle={() => onAllOpeningsChange(!allOpenings)}
            />
          </>
        )}
      </Section>

      <Section title="Tournaments" description="Most recent first.">
        {stats.events.length === 0 ? (
          <p className="text-muted-foreground text-sm">No games in this period name an event.</p>
        ) : (
          <>
            <BreakdownTable rows={eventRows} labelHeader="Event" extra={[performanceColumn]} />
            <ShowMore
              shown={eventRows.length}
              total={stats.events.length}
              expanded={allEvents}
              onToggle={() => onAllEventsChange(!allEvents)}
            />
          </>
        )}
      </Section>
    </>
  );
}
