import type { OutcomeTally } from "@/core/domain/outcome-tally";
import { cn } from "@/lib/utils";

/**
 * Wins, draws and losses as one bar, always in that order.
 *
 * Proportions of the *decided* games, not of every game: an unfinished game, or
 * one the owner was not in, has no result to show, and stretching the bar over
 * it would quietly turn missing information into a fourth outcome.
 *
 * The fills are the chart tokens, not the badge tints — see `--outcome-*` in
 * `globals.css` for why. A 2px gap in the page colour separates the segments,
 * and the bar is never the only place the numbers appear: green against red
 * does not separate fully for every reader, so each use sits beside
 * {@link OutcomeCounts}.
 */
export function OutcomeBar({ tally, className }: { tally: OutcomeTally; className?: string }) {
  if (tally.scored === 0) {
    return (
      <span className={cn("text-muted-foreground truncate text-xs", className)}>
        no finished games
      </span>
    );
  }

  const segments = [
    { key: "win", count: tally.wins, fill: "bg-outcome-win", label: "won" },
    { key: "draw", count: tally.draws, fill: "bg-outcome-draw", label: "drawn" },
    { key: "loss", count: tally.losses, fill: "bg-outcome-loss", label: "lost" },
  ].filter((segment) => segment.count > 0);

  const description = segments
    .map((segment) => `${segment.count} ${segment.label}`)
    .join(" · ");

  return (
    <span
      role="img"
      aria-label={description}
      title={description}
      className={cn("flex h-3 gap-[2px]", className)}
    >
      {segments.map((segment, index) => (
        <span
          key={segment.key}
          // Grow rather than width: with gaps between segments, percentages
          // would add up to more than the bar and overflow it.
          style={{ flexGrow: segment.count, flexBasis: 0 }}
          className={cn(
            "min-w-[3px]",
            segment.fill,
            // Square where the bar starts, rounded only at its far end.
            index === segments.length - 1 && "rounded-r-[4px]",
          )}
        />
      ))}
    </span>
  );
}

/**
 * The same record as figures — won, drawn, lost.
 *
 * The part of the encoding that does not depend on colour at all.
 */
export function OutcomeCounts({ tally, className }: { tally: OutcomeTally; className?: string }) {
  return (
    <span
      className={cn("text-muted-foreground tabular-nums", className)}
      title={`${tally.wins} won, ${tally.draws} drawn, ${tally.losses} lost`}
    >
      {tally.wins}–{tally.draws}–{tally.losses}
    </span>
  );
}

/**
 * The record as a single number: percentage of the available points.
 *
 * In ordinary text colour. A result tint on text reads poorly on both themes,
 * and the bar beside it already says whether the record is good. A line never
 * decided shows a dash rather than a fabricated 50%.
 */
export function ScorePercent({ tally, className }: { tally: OutcomeTally; className?: string }) {
  return (
    <span
      className={cn(
        "text-right tabular-nums",
        tally.scored === 0 ? "text-muted-foreground" : "text-foreground",
        className,
      )}
      title={
        tally.scored === 0
          ? "No finished games yet"
          : `${tally.scored} finished game${tally.scored === 1 ? "" : "s"}`
      }
    >
      {tally.scored === 0 ? "—" : `${Math.round(tally.score * 100)}%`}
    </span>
  );
}
