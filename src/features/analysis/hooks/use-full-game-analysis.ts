"use client";

import { useCallback, useRef, useState } from "react";
import type { TreeNode } from "@/core/chess/pgn/game-timeline";
import {
  getEvaluations,
  saveEvaluation,
} from "@/persistence/repositories/evaluation-repository";
import { AnalysisAbortedError } from "../engine/engine-service";
import type { StockfishEngine } from "../engine/stockfish-engine";

export interface FullGameProgress {
  analysed: number;
  total: number;
}

/**
 * Analyse every position of a game.
 *
 * Positions already evaluated deeply enough are skipped, so re-running after
 * adding a few moves, or analysing a game that transposes into one already
 * studied, costs only the genuinely new work. On a personal collection with a
 * consistent repertoire that saves a great deal of time.
 *
 * The run is sequential rather than parallel: there is one engine, and asking
 * it to search several positions at once would only interleave them and finish
 * no sooner.
 *
 * It produces evaluations and nothing else. Each is saved the moment it exists,
 * and the report is read from what is saved — see `reportFromEvaluations` — so
 * a report never lives only in this hook's memory, where a reload would lose it.
 */
export function useFullGameAnalysis(engine: StockfishEngine) {
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

      const stored = await getEvaluations(timeline.map((node) => node.key));

      try {
        for (const [index, node] of timeline.entries()) {
          if (cancelled.current) break;

          const existing = stored.get(node.key);

          if (!existing || existing.depth < depth) {
            // MultiPV of 1: the report needs the best move and the evaluation,
            // and requesting alternatives for every ply would multiply the cost
            // of a run that already takes a while.
            const result = await engine.analyse({ fen: node.fen, depth, multiPv: 1 });
            await saveEvaluation(node.key, result);
          }

          setProgress({ analysed: index + 1, total: timeline.length });
        }
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
