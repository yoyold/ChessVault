"use client";

import { useCallback, useState } from "react";
import type { PositionAnalysis } from "@/core/analysis/types";
import { positionKeyFromFen } from "@/core/chess/position-key";
import {
  getEvaluation,
  saveEvaluation,
} from "@/persistence/repositories/evaluation-repository";
import { AnalysisAbortedError } from "../engine/engine-service";
import type { StockfishEngine } from "../engine/stockfish-engine";

export interface EngineSettings {
  depth: number;
  multiPv: number;
}

export interface EngineAnalysisState {
  analysis: PositionAnalysis | null;
  running: boolean;
  error: string | null;
  /** True while showing a stored evaluation rather than a live search. */
  fromCache: boolean;
}

const IDLE: EngineAnalysisState = {
  analysis: null,
  running: false,
  error: null,
  fromCache: false,
};

/**
 * Analyse a single position, reusing a stored evaluation when one is deep enough.
 *
 * The cache check is what makes stepping back and forth through an analysed
 * game instant instead of re-running the engine at every step.
 */
export function useEngineAnalysis(engine: StockfishEngine, settings: EngineSettings) {
  const [state, setState] = useState<EngineAnalysisState>(IDLE);

  const analyse = useCallback(
    async (fen: string, options: { force?: boolean } = {}) => {
      const key = positionKeyFromFen(fen);

      if (!options.force) {
        const stored = await getEvaluation(key);

        // A stored evaluation at least as deep as requested already answers the
        // question; re-running would spend seconds reproducing it.
        if (stored && stored.depth >= settings.depth) {
          setState({
            analysis: { depth: stored.depth, lines: stored.lines, engine: stored.engine },
            running: false,
            error: null,
            fromCache: true,
          });
          return;
        }
      }

      setState({ ...IDLE, running: true });

      try {
        const result = await engine.analyse(
          { fen, depth: settings.depth, multiPv: settings.multiPv },
          (progress) => setState({ analysis: progress, running: true, error: null, fromCache: false }),
        );

        setState({ analysis: result, running: false, error: null, fromCache: false });
        await saveEvaluation(key, result, { force: options.force });
      } catch (error) {
        // Abandoning a search is the normal consequence of stepping to the next
        // move, not a failure worth surfacing.
        if (error instanceof AnalysisAbortedError) return;

        setState({
          ...IDLE,
          error: error instanceof Error ? error.message : "Engine error",
        });
      }
    },
    [engine, settings.depth, settings.multiPv],
  );

  const reset = useCallback(() => setState(IDLE), []);

  return { ...state, analyse, reset };
}
