"use client";

import { useCallback, useRef, useState } from "react";
import type { TreeNode } from "@/core/chess/pgn/game-timeline";
import { analyseTimeline } from "../engine/analyse-timeline";
import { AnalysisAbortedError, type EngineService } from "../engine/engine-service";

export interface FullGameProgress {
  analysed: number;
  total: number;
}

/**
 * Analyse every position of the game on screen.
 *
 * It produces evaluations and nothing else. Each is saved the moment it exists,
 * and the report is read from what is saved — see `reportFromEvaluations` — so
 * a report never lives only in this hook's memory, where a reload would lose it.
 * The work itself is {@link analyseTimeline}, shared with the background
 * analysis of the whole collection.
 */
export function useFullGameAnalysis(engine: EngineService) {
  const [progress, setProgress] = useState<FullGameProgress | null>(null);
  const cancelled = useRef(false);

  const cancel = useCallback(() => {
    cancelled.current = true;
    engine.stop();
  }, [engine]);

  const run = useCallback(
    async (timeline: readonly TreeNode[], depth: number) => {
      cancelled.current = false;
      setProgress({ analysed: 0, total: timeline.length });

      try {
        await analyseTimeline(engine, timeline, {
          depth,
          shouldStop: () => cancelled.current,
          onPosition: (analysed, total) => setProgress({ analysed, total }),
        });
      } catch (error) {
        if (!(error instanceof AnalysisAbortedError)) throw error;
      } finally {
        setProgress(null);
      }
    },
    [engine],
  );

  return { run, cancel, progress };
}
