"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { formatScore } from "@/core/analysis/types";
import { formatVariation } from "@/core/analysis/variation-notation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EngineAnalysisState, EngineSettings } from "../hooks/use-engine-analysis";

interface EnginePanelProps extends EngineAnalysisState {
  settings: EngineSettings;
  onSettingsChange: (settings: EngineSettings) => void;
  onReanalyse: () => void;
}

const SELECT_CLASS = "border-input bg-background h-8 rounded-md border px-2 text-sm";

export function EnginePanel({
  analysis,
  fen,
  running,
  error,
  fromCache,
  settings,
  onSettingsChange,
  onReanalyse,
}: EnginePanelProps) {
  /*
   * Replaying each line costs a board per variation, and the engine reports
   * progress several times a second. Memoised on the analysis itself so the
   * work happens when the lines change rather than on every render of the
   * surrounding view — the engine's depth counter alone re-renders this panel.
   */
  const variations = useMemo(
    () =>
      (analysis?.lines ?? []).map((line) => ({
        multiPv: line.multiPv,
        score: line.score,
        moves: fen ? formatVariation(fen, line.moves) : "",
      })),
    [analysis, fen],
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-muted-foreground flex items-center gap-1 text-sm">
          Depth
          <select
            className={SELECT_CLASS}
            value={settings.depth}
            aria-label="Search depth"
            onChange={(event) =>
              onSettingsChange({ ...settings, depth: Number(event.target.value) })
            }
          >
            {[12, 16, 20, 24, 28].map((depth) => (
              <option key={depth} value={depth}>
                {depth}
              </option>
            ))}
          </select>
        </label>

        <label className="text-muted-foreground flex items-center gap-1 text-sm">
          Lines
          <select
            className={SELECT_CLASS}
            value={settings.multiPv}
            aria-label="Number of variations"
            onChange={(event) =>
              onSettingsChange({ ...settings, multiPv: Number(event.target.value) })
            }
          >
            {[1, 2, 3, 5].map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>

        {running ? (
          <span className="text-muted-foreground flex items-center gap-1 text-sm">
            <Loader2 className="size-3.5 animate-spin" />
            depth {analysis?.depth ?? 0}
          </span>
        ) : null}

        {fromCache && !running ? (
          // Worth stating: a stored result may come from a different engine or
          // a deeper search than the one currently configured.
          <Badge variant="secondary" className="text-xs">
            stored, depth {analysis?.depth}
          </Badge>
        ) : null}

        <Button variant="outline" size="sm" className="ml-auto" onClick={onReanalyse}>
          Re-analyse
        </Button>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {variations.length > 0 ? (
        <ol className="flex flex-col gap-1">
          {variations.map((line) => (
            <li key={line.multiPv} className="flex gap-2 text-sm">
              <span className="w-16 shrink-0 font-medium tabular-nums">
                {formatScore(line.score)}
              </span>
              {/* Not monospaced any more: the coordinates were columns of
                  equal-width tokens, where notation is words and reads as
                  prose does. */}
              <span className="text-muted-foreground truncate">{line.moves}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground text-sm">
          {running ? "Thinking…" : "No evaluation for this position yet."}
        </p>
      )}
    </section>
  );
}
