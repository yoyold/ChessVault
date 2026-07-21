"use client";

import { useCallback, useRef, useState } from "react";
import type { TreeNode } from "@/core/chess/pgn/game-timeline";
import type { PositionKey } from "@/core/chess/position-key";
import { buildGameReport, type EvaluatedPosition, type GameReport } from "@/core/analysis/game-report";
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
 * Analyse every position of a game and build a report from the results.
 *
 * Positions already evaluated deeply enough are skipped, so re-running after
 * adding a few moves, or analysing a game that transposes into one already
 * studied, costs only the genuinely new work. On a personal collection with a
 * consistent repertoire that saves a great deal of time.
 *
 * The run is sequential rather than parallel: there is one engine, and asking
 * it to search several positions at once would only interleave them and finish
 * no sooner.
 */
export function useFullGameAnalysis(engine: StockfishEngine) {
  const [progress, setProgress] = useState<FullGameProgress | null>(null);
  const [report, setReport] = useState<GameReport | null>(null);
  const cancelled = useRef(false);

  const cancel = useCallback(() => {
    cancelled.current = true;
    engine.stop();
  }, [engine]);

  const run = useCallback(
    async (timeline: readonly TreeNode[], depth: number) => {
      cancelled.current = false;
      setReport(null);
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
            stored.set(node.key, {
              key: node.key,
              depth: result.depth,
              multiPv: 1,
              lines: result.lines,
              engine: result.engine,
              evaluatedAt: Date.now(),
            });
          }

          setProgress({ analysed: index + 1, total: timeline.length });
        }
      } catch (error) {
        if (!(error instanceof AnalysisAbortedError)) throw error;
      }

      const evaluated = new Map<PositionKey, EvaluatedPosition>();

      for (const [key, record] of stored) {
        const best = record.lines[0];
        if (!best) continue;

        evaluated.set(key, {
          score: best.score,
          bestMove: best.moves[0] ?? null,
        });
      }

      // Built even when cancelled: a partial report is useful, and
      // `unevaluatedPlies` states plainly how much of the game it covers.
      setReport(buildGameReport(timeline, evaluated));
      setProgress(null);
    },
    [engine],
  );

  return { run, cancel, progress, report, clearReport: () => setReport(null) };
}
