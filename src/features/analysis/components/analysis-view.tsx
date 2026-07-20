"use client";

import { Chessboard } from "react-chessboard";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, SkipBack, SkipForward } from "lucide-react";
import { buildTimeline, formatMoveNumber } from "@/core/chess/pgn/game-timeline";
import type { Score } from "@/core/analysis/types";
import type { MoveQuality } from "@/core/analysis/move-quality";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getFullGame } from "@/persistence/repositories/game-repository";
import { getEvaluations } from "@/persistence/repositories/evaluation-repository";
import { useEngine } from "../hooks/use-engine";
import { useEngineAnalysis, type EngineSettings } from "../hooks/use-engine-analysis";
import { useFullGameAnalysis } from "../hooks/use-full-game-analysis";
import { EnginePanel } from "./engine-panel";
import { EvalGraph } from "./eval-graph";
import { GameReportSummary } from "./game-report-summary";

const QUALITY_MARK: Partial<Record<MoveQuality, { label: string; className: string }>> = {
  inaccuracy: { label: "?!", className: "text-yellow-600 dark:text-yellow-500" },
  mistake: { label: "?", className: "text-orange-600 dark:text-orange-500" },
  blunder: { label: "??", className: "text-red-600 dark:text-red-500" },
};

export function AnalysisView({ gameId }: { gameId: number }) {
  const engine = useEngine();

  const [ply, setPly] = useState(0);
  const [settings, setSettings] = useState<EngineSettings>({ depth: 16, multiPv: 3 });

  const game = useLiveQuery(() => getFullGame(gameId), [gameId]);

  const timeline = useMemo(() => {
    if (!game) return [];

    try {
      return buildTimeline(game.content.pgn);
    } catch {
      // A game that failed to parse should not blank the page; the empty
      // timeline is reported below.
      return [];
    }
  }, [game]);

  const { analyse, reset, ...analysisState } = useEngineAnalysis(engine, settings);
  const fullGame = useFullGameAnalysis(engine);

  const current = timeline[ply];

  // Analyse whenever the position or the settings change. Stepping through a
  // game abandons the previous search, which the engine handles internally.
  useEffect(() => {
    if (!current) return;

    void analyse(current.fen);
  }, [current, analyse]);

  // Stored evaluations for the whole game, so the graph and move marks reflect
  // work done in earlier sessions without re-running anything.
  const storedEvaluations = useLiveQuery(
    async () => (timeline.length > 0 ? getEvaluations(timeline.map((n) => n.key)) : new Map()),
    [timeline],
  );

  const graphScores: (Score | null)[] = useMemo(
    () =>
      timeline.map((node) => storedEvaluations?.get(node.key)?.lines[0]?.score ?? null),
    [timeline, storedEvaluations],
  );

  const qualityByPly = useMemo(() => {
    const map = new Map<number, MoveQuality>();
    for (const move of fullGame.report?.moves ?? []) map.set(move.ply, move.assessment.quality);
    return map;
  }, [fullGame.report]);

  if (game === undefined) {
    return <p className="text-muted-foreground text-sm">Loading game…</p>;
  }

  if (game === null) {
    return <p className="text-muted-foreground text-sm">This game no longer exists.</p>;
  }

  if (timeline.length === 0) {
    return <p className="text-destructive text-sm">This game&apos;s moves could not be read.</p>;
  }

  const step = (delta: number) =>
    setPly((previous) => Math.max(0, Math.min(timeline.length - 1, previous + delta)));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <Chessboard
          options={{
            position: current.fen,
            boardOrientation: game.record.playerColor === "black" ? "black" : "white",
            allowDragging: false,
            showNotation: true,
            animationDurationInMs: 120,
          }}
        />

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="First move" onClick={() => setPly(0)}>
            <SkipBack />
          </Button>
          <Button variant="outline" size="icon" aria-label="Previous move" onClick={() => step(-1)}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" aria-label="Next move" onClick={() => step(1)}>
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Last move"
            onClick={() => setPly(timeline.length - 1)}
          >
            <SkipForward />
          </Button>

          <span className="text-muted-foreground ml-2 text-sm tabular-nums">
            {ply === 0 ? "Start" : `${formatMoveNumber(ply)} ${current.san}`}
          </span>
        </div>

        <EvalGraph scores={graphScores} currentPly={ply} onSelectPly={setPly} />
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <EnginePanel
          {...analysisState}
          settings={settings}
          onSettingsChange={setSettings}
          onReanalyse={() => {
            reset();
            void analyse(current.fen, { force: true });
          }}
        />

        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">Full game analysis</h2>

            {fullGame.progress ? (
              <>
                <span className="text-muted-foreground text-sm tabular-nums">
                  <Loader2 className="mr-1 inline size-3.5 animate-spin" />
                  {fullGame.progress.analysed} / {fullGame.progress.total}
                </span>
                <Button variant="outline" size="sm" onClick={fullGame.cancel}>
                  Stop
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                className="ml-auto"
                onClick={() => void fullGame.run(timeline, settings.depth)}
              >
                Analyse every move
              </Button>
            )}
          </div>

          {fullGame.report ? <GameReportSummary report={fullGame.report} /> : null}
        </section>

        <MoveList
          timeline={timeline}
          currentPly={ply}
          qualityByPly={qualityByPly}
          onSelect={setPly}
        />
      </div>
    </div>
  );
}

function MoveList({
  timeline,
  currentPly,
  qualityByPly,
  onSelect,
}: {
  timeline: ReturnType<typeof buildTimeline>;
  currentPly: number;
  qualityByPly: Map<number, MoveQuality>;
  onSelect: (ply: number) => void;
}) {
  return (
    <ol className="flex max-h-64 flex-wrap gap-x-1 gap-y-0.5 overflow-auto text-sm">
      {timeline.slice(1).map((node) => {
        const mark = QUALITY_MARK[qualityByPly.get(node.ply) ?? "good"];

        return (
          <li key={node.ply} className="flex items-baseline gap-1">
            {node.ply % 2 === 1 ? (
              <span className="text-muted-foreground tabular-nums">
                {formatMoveNumber(node.ply)}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onSelect(node.ply)}
              className={cn(
                "rounded px-1",
                node.ply === currentPly ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
              )}
            >
              {node.san}
              {mark ? <span className={mark.className}>{mark.label}</span> : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
