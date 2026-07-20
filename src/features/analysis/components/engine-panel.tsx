"use client";

import { Loader2 } from "lucide-react";
import { formatScore } from "@/core/analysis/types";
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
  running,
  error,
  fromCache,
  settings,
  onSettingsChange,
  onReanalyse,
}: EnginePanelProps) {
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

      {analysis && analysis.lines.length > 0 ? (
        <ol className="flex flex-col gap-1">
          {analysis.lines.map((line) => (
            <li key={line.multiPv} className="flex gap-2 text-sm">
              <span className="w-16 shrink-0 font-medium tabular-nums">
                {formatScore(line.score)}
              </span>
              {/*
                Variations are shown in the engine's own notation. Converting to
                SAN needs a board replay per line on every progress update,
                which is work the panel does not need to do to be useful.
              */}
              <span className="text-muted-foreground truncate font-mono text-xs">
                {line.moves.slice(0, 12).join(" ")}
              </span>
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
