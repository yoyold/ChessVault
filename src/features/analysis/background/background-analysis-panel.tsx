"use client";

import { useEffect } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/features/shell/use-settings";
import { saveSettings } from "@/lib/settings";
import { useBackgroundAnalysis } from "./analysis-provider";

const SELECT_CLASS = "border-input bg-background h-9 rounded-md border px-2 text-sm";

/**
 * Depths offered, and what each is good for. Every step roughly doubles the
 * time, so the choice is between waiting and noticing subtler errors.
 */
const DEPTHS = [
  { depth: 10, label: "10 — quick, catches blunders" },
  { depth: 12, label: "12" },
  { depth: 14, label: "14 — recommended" },
  { depth: 16, label: "16" },
  { depth: 18, label: "18 — slow, finer errors" },
];

/** Written to start a sentence. */
function formatDuration(seconds: number): string {
  if (seconds < 90) return "About a minute";
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `About ${minutes} minutes`;
  return `About ${Math.round(minutes / 60)} hours`;
}

/**
 * Start, pause and follow the analysis of the whole collection.
 *
 * Says plainly what it does and what it costs, because it is a long-running
 * job on the user's own machine: it runs only while the app is open, pauses
 * itself while a game is being analysed by hand, and picks up where it stopped.
 */
export function BackgroundAnalysisPanel() {
  const { state, start, pause, refresh } = useBackgroundAnalysis();
  const { analysisDepth } = useSettings();
  const active = state.status === "running" || state.status === "yielding";

  // Count what is done at the remembered depth when the panel appears, and
  // again when the depth changes — the same games are "done" at 12 and not at 16.
  useEffect(() => {
    void refresh(analysisDepth);
  }, [analysisDepth, refresh]);

  const remaining = state.total - state.analysed;
  const share = state.total === 0 ? 0 : state.analysed / state.total;

  return (
    <div className="bg-card flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          Depth
          <select
            className={SELECT_CLASS}
            value={analysisDepth}
            disabled={active}
            aria-label="Analysis depth"
            onChange={(event) => saveSettings({ analysisDepth: Number(event.target.value) })}
          >
            {DEPTHS.map((option) => (
              <option key={option.depth} value={option.depth}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {active ? (
          <Button variant="outline" className="gap-2" onClick={pause}>
            <Pause className="size-4" />
            Pause
          </Button>
        ) : remaining > 0 ? (
          <Button className="gap-2" onClick={() => start(analysisDepth)}>
            <Play className="size-4" />
            {state.analysed > 0 ? "Continue" : "Analyse all games"}
          </Button>
        ) : null}
      </div>

      {state.total > 0 ? (
        <div className="flex flex-col gap-1.5">
          {/* A meter: the fill is how much is done, the track the same hue lighter. */}
          <div
            className="bg-series-1/20 h-2 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={state.total}
            aria-valuenow={state.analysed}
            aria-label="Games analysed"
          >
            <div className="bg-series-1 h-full rounded-full" style={{ width: `${share * 100}%` }} />
          </div>
          <p className="text-sm">
            <span className="font-medium">
              {state.analysed.toLocaleString()} of {state.total.toLocaleString()}
            </span>{" "}
            <span className="text-muted-foreground">
              games analysed at depth {state.depth}
              {remaining === 0 ? " — all done." : "."}
              {active && state.secondsPerGame !== null && remaining > 0
                ? ` ${formatDuration(state.secondsPerGame * remaining)} left.`
                : ""}
            </span>
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No games of yours to analyse yet. Games are yours when your name is set in Settings.
        </p>
      )}

      {state.status === "running" && state.current ? (
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          <span className="truncate">
            {state.current.label} — position {state.current.position} of {state.current.positions}
          </span>
        </p>
      ) : null}

      {state.status === "yielding" ? (
        <p className="text-muted-foreground text-xs">
          Waiting while the engine is analysing a game you opened. It carries on when you leave it.
        </p>
      ) : null}

      {state.failed > 0 ? (
        <p className="text-muted-foreground text-xs">
          {state.failed} game{state.failed === 1 ? "" : "s"} could not be read and{" "}
          {state.failed === 1 ? "was" : "were"} skipped.
        </p>
      ) : null}

      {state.error ? (
        <p className="text-destructive text-xs">Stopped: {state.error}</p>
      ) : null}

      <p className="text-muted-foreground text-xs">
        Runs only while ChessVault is open, newest games first. Pausing or closing
        keeps everything finished; it continues where it stopped.
      </p>
    </div>
  );
}
