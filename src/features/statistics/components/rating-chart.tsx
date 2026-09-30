"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import type { RatingPoint } from "@/core/statistics/statistics";

/** Plot coordinates. Stretched to the element, so only lines are drawn in them. */
const WIDTH = 1000;
const HEIGHT = 200;

const DAY = 24 * 60 * 60 * 1000;

/** A tick step that gives a handful of round numbers across the range. */
function tickStep(range: number): number {
  if (range <= 100) return 25;
  if (range <= 300) return 50;
  if (range <= 800) return 100;
  return 200;
}

function formatDate(dateIso: string): string {
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * The owner's rating over time, one point per day it was recorded.
 *
 * Time runs to scale on the x axis: games are played in bursts, a weekend
 * tournament and then nothing for a month, and spacing the points evenly would
 * draw a quiet month as a steep climb.
 *
 * The line is drawn in SVG stretched to the element; the dots and labels are
 * placed over it in HTML, where a stretched circle would otherwise become an
 * ellipse. Hover or arrow keys pick a point, and the table below the chart
 * carries every value for anyone not using the chart at all.
 */
export function RatingChart({ points }: { points: readonly RatingPoint[] }) {
  const [active, setActive] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <p className="text-muted-foreground text-sm">
        A rating trend needs games with your rating on at least two different days.
      </p>
    );
  }

  const times = points.map((point) => Date.parse(`${point.dateIso}T00:00:00`));
  const first = times[0];
  const span = Math.max(times[times.length - 1] - first, DAY);

  const ratings = points.map((point) => point.rating);
  const step = tickStep(Math.max(...ratings) - Math.min(...ratings));
  const low = Math.floor(Math.min(...ratings) / step) * step;
  const high = Math.max(Math.ceil(Math.max(...ratings) / step) * step, low + step);

  const ticks: number[] = [];
  for (let value = low; value <= high; value += step) ticks.push(value);

  /** Position as a share of the plot, 0–1, with y growing downwards. */
  const xAt = (index: number) => (times[index] - first) / span;
  const yAt = (rating: number) => 1 - (rating - low) / (high - low);

  const line = points
    .map((point, index) => `${xAt(index) * WIDTH},${yAt(point.rating) * HEIGHT}`)
    .join(" ");

  const last = points.length - 1;

  /** The point nearest the pointer along the time axis. */
  const nearest = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left) / bounds.width;

    let best = 0;
    for (let index = 1; index < points.length; index += 1) {
      if (Math.abs(xAt(index) - ratio) < Math.abs(xAt(best) - ratio)) best = index;
    }
    return best;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = active ?? last;
    const next =
      event.key === "ArrowLeft"
        ? Math.max(0, current - 1)
        : event.key === "ArrowRight"
          ? Math.min(last, current + 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;

    if (next === null) return;
    event.preventDefault();
    setActive(next);
  };

  const shown = active ?? last;
  const change = points[last].rating - points[0].rating;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {/* Round ticks on the value axis, in the muted ink. */}
        <div className="text-muted-foreground relative h-40 w-10 shrink-0 text-right text-xs tabular-nums">
          {ticks.map((value) => (
            <span
              key={value}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${yAt(value) * 100}%` }}
            >
              {value}
            </span>
          ))}
        </div>

        <div
          className="focus-visible:ring-ring relative h-40 min-w-0 flex-1 rounded-sm outline-none focus-visible:ring-2"
          tabIndex={0}
          role="img"
          aria-label={`Rating from ${points[0].rating} on ${formatDate(points[0].dateIso)} to ${points[last].rating} on ${formatDate(points[last].dateIso)}. Use the arrow keys to read individual points.`}
          onPointerMove={(event) => setActive(nearest(event))}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
        >
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
            aria-hidden
          >
            {ticks.map((value) => (
              <line
                key={value}
                x1={0}
                x2={WIDTH}
                y1={yAt(value) * HEIGHT}
                y2={yAt(value) * HEIGHT}
                className="stroke-border"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <polyline
              points={line}
              fill="none"
              className="stroke-series-1"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {active !== null ? (
            // Crosshair, drawn in HTML so it stays one pixel wide.
            <span
              className="bg-foreground/30 pointer-events-none absolute inset-y-0 w-px"
              style={{ left: `${xAt(active) * 100}%` }}
            />
          ) : null}

          <Dot x={xAt(shown)} y={yAt(points[shown].rating)} />

          <span
            className="bg-popover text-popover-foreground pointer-events-none absolute z-10 rounded border px-2 py-0.5 text-xs whitespace-nowrap shadow-sm"
            style={{
              left: `${xAt(shown) * 100}%`,
              top: `${yAt(points[shown].rating) * 100}%`,
              // Kept inside the plot at either end, and above the dot unless
              // there is no room above it.
              transform: `translate(${xAt(shown) < 0.15 ? "0" : xAt(shown) > 0.85 ? "-100%" : "-50%"}, ${yAt(points[shown].rating) < 0.25 ? "40%" : "-140%"})`,
            }}
          >
            <span className="font-medium tabular-nums">{points[shown].rating}</span>
            <span className="text-muted-foreground ml-2">{formatDate(points[shown].dateIso)}</span>
          </span>
        </div>
      </div>

      <div className="text-muted-foreground flex justify-between pl-12 text-xs">
        <span>{formatDate(points[0].dateIso)}</span>
        <span>
          {change === 0 ? "No change" : `${change > 0 ? "+" : "−"}${Math.abs(change)} overall`}
        </span>
        <span>{formatDate(points[last].dateIso)}</span>
      </div>

      <details className="text-sm">
        <summary className="text-muted-foreground cursor-pointer text-xs">Show as a table</summary>
        <table className="mt-2 w-full max-w-xs text-xs">
          <thead>
            <tr className="text-muted-foreground text-left">
              <th className="py-1 font-normal">Date</th>
              <th className="py-1 text-right font-normal">Rating</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((point) => (
              <tr key={point.dateIso} className="border-t">
                <td className="py-1">{formatDate(point.dateIso)}</td>
                <td className="py-1 text-right tabular-nums">{point.rating}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** A point on the line: at least 8px, with a ring in the page colour. */
function Dot({ x, y }: { x: number; y: number }) {
  return (
    <span
      className="bg-series-1 ring-background pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
    />
  );
}
