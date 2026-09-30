import type { TreeNode } from "@/core/chess/pgn/parse-tree";
import {
  getEvaluations,
  saveEvaluation,
} from "@/persistence/repositories/evaluation-repository";
import type { EngineService } from "./engine-service";

export interface TimelineAnalysisOptions {
  depth: number;
  /**
   * Asked immediately before each search. Returning true ends the run, with
   * everything evaluated so far already saved.
   *
   * Asked in the same tick as the search is sent, never across an await: the
   * engine lets the newest request win, so a caller that must give the engine
   * up — the background analysis, when the user opens a game — has to be able
   * to say so before its next search goes out, not after it has pre-empted
   * someone else's.
   */
  shouldStop?: () => boolean;
  /** Called after each position, whether it was searched or already done. */
  onPosition?: (done: number, total: number) => void;
}

/**
 * Evaluate every position of a line of play.
 *
 * Positions already evaluated at least as deeply are skipped, so re-running
 * after a few moves were added, or on a game that transposes into one already
 * studied, costs only the new work. Each evaluation is saved the moment it is
 * made: a run cut short — stopped, pre-empted, or the page closed — keeps
 * everything it finished.
 *
 * Sequential, because there is one engine; searching several positions at
 * once would only interleave them and finish no sooner.
 *
 * @returns Whether every position now has an evaluation at the depth asked.
 * @throws AnalysisAbortedError when another request took the engine mid-search.
 */
export async function analyseTimeline(
  engine: EngineService,
  timeline: readonly TreeNode[],
  options: TimelineAnalysisOptions,
): Promise<boolean> {
  const { depth, shouldStop = () => false, onPosition } = options;
  const stored = await getEvaluations(timeline.map((node) => node.key));

  for (const [index, node] of timeline.entries()) {
    const existing = stored.get(node.key);

    if (!existing || existing.depth < depth) {
      if (shouldStop()) return false;

      // MultiPV of 1: a report needs the best move and the evaluation, and
      // alternatives for every ply would multiply the cost of a long run.
      const result = await engine.analyse({ fen: node.fen, depth, multiPv: 1 });
      await saveEvaluation(node.key, result);
    }

    onPosition?.(index + 1, timeline.length);
  }

  return true;
}
