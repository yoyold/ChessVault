import type { PositionKey } from "@/core/chess/position-key";
import type { EvaluationRecord } from "@/core/domain/evaluation";
import type { PositionAnalysis } from "@/core/analysis/types";
import { db } from "@/persistence/db";

export async function getEvaluation(
  key: PositionKey,
): Promise<EvaluationRecord | undefined> {
  return db.evaluations.get(key);
}

/** Load evaluations for many positions at once, keyed for lookup. */
export async function getEvaluations(
  keys: readonly PositionKey[],
): Promise<Map<PositionKey, EvaluationRecord>> {
  const records = await db.evaluations.bulkGet([...keys]);

  const found = new Map<PositionKey, EvaluationRecord>();
  for (const record of records) {
    if (record) found.set(record.key, record);
  }

  return found;
}

/**
 * Store an analysis, keeping whichever evaluation is more informative.
 *
 * A shallower result never replaces a deeper one. Without this rule, glancing
 * at a position with a quick search would discard a deep evaluation that took
 * far longer to produce — and the user has no way to tell that happened.
 *
 * @param force Replace regardless of depth. Used when re-analysing
 *   deliberately, for instance after changing engine.
 * @returns Whether the record was written.
 */
export async function saveEvaluation(
  key: PositionKey,
  analysis: PositionAnalysis,
  options: { force?: boolean } = {},
): Promise<boolean> {
  return db.transaction("rw", db.evaluations, async () => {
    const existing = await db.evaluations.get(key);

    const supersedes =
      options.force === true ||
      existing === undefined ||
      analysis.depth > existing.depth ||
      // Same depth but more variations is strictly more information.
      (analysis.depth === existing.depth &&
        analysis.lines.length > existing.lines.length);

    if (!supersedes) return false;

    await db.evaluations.put({
      key,
      depth: analysis.depth,
      multiPv: analysis.lines.length,
      lines: analysis.lines,
      engine: analysis.engine,
      evaluatedAt: Date.now(),
    });

    return true;
  });
}

/** Positions already evaluated to at least the given depth. */
export async function countEvaluatedAtDepth(minimumDepth: number): Promise<number> {
  return db.evaluations.where("depth").aboveOrEqual(minimumDepth).count();
}
