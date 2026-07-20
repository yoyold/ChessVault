"use client";

import type { ColourSummary, GameReport } from "@/core/analysis/game-report";

/**
 * Per-side summary of a full-game analysis.
 *
 * Average centipawn loss is reported alongside the counts because it is the
 * conventional accuracy measure and comparable across games, even though the
 * classifications themselves are made on winning chances rather than
 * centipawns.
 */
export function GameReportSummary({ report }: { report: GameReport }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <SideSummary label="White" summary={report.white} />
        <SideSummary label="Black" summary={report.black} />
      </div>

      {report.unevaluatedPlies.length > 0 ? (
        // Stated plainly: a partial analysis must not read as a clean game.
        <p className="text-muted-foreground text-xs">
          {report.unevaluatedPlies.length} move
          {report.unevaluatedPlies.length === 1 ? "" : "s"} not analysed, so this
          summary is incomplete.
        </p>
      ) : null}
    </div>
  );
}

function SideSummary({ label, summary }: { label: string; summary: ColourSummary }) {
  const { counts } = summary;

  return (
    <div className="rounded-md border p-3 text-sm">
      <div className="flex items-baseline justify-between">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          avg. loss {summary.averageCentipawnLoss} cp
        </span>
      </div>

      <dl className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1 text-xs">
        <Stat label="Inaccuracies" value={counts.inaccuracy} />
        <Stat label="Mistakes" value={counts.mistake} />
        <Stat label="Blunders" value={counts.blunder} />
      </dl>

      {summary.missedMates > 0 || summary.missedWins > 0 ? (
        <p className="text-muted-foreground mt-2 text-xs">
          {summary.missedMates > 0 ? `${summary.missedMates} missed mate` : null}
          {summary.missedMates > 0 && summary.missedWins > 0 ? ", " : null}
          {summary.missedWins > 0 ? `${summary.missedWins} missed win` : null}
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
