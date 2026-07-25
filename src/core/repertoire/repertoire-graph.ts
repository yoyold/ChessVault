import { sideToMoveOf, type PositionKey } from "@/core/chess/position-key";
import { isOwnerToMove, type RepertoireMove } from "@/core/domain/repertoire";
import type { Color } from "@/core/domain/game";

/**
 * One prepared move, as the graph traverses it.
 *
 * A narrower view than the stored record: traversal needs only where a move
 * leads and how it is ordered among its siblings.
 */
export interface RepertoireEdge {
  fromKey: PositionKey;
  toKey: PositionKey;
  san: string;
  priority: number;
}

/** Positions mapped to the moves prepared from them. */
export type RepertoireGraph = ReadonlyMap<PositionKey, readonly RepertoireEdge[]>;

/**
 * Group moves by the position they start from.
 *
 * Siblings are ordered by priority, highest first, so the main line comes out
 * ahead of its alternatives without the caller re-sorting. Ties fall back to
 * move notation, which keeps rendering stable across reloads instead of
 * shuffling with insertion order.
 */
export function buildRepertoireGraph(
  moves: readonly RepertoireMove[],
): RepertoireGraph {
  const graph = new Map<PositionKey, RepertoireEdge[]>();

  for (const move of moves) {
    const edges = graph.get(move.fromKey) ?? [];
    edges.push({
      fromKey: move.fromKey,
      toKey: move.toKey,
      san: move.san,
      priority: move.priority,
    });
    graph.set(move.fromKey, edges);
  }

  for (const edges of graph.values()) {
    edges.sort((a, b) => b.priority - a.priority || a.san.localeCompare(b.san));
  }

  return graph;
}

/**
 * Every position reachable from a starting position, including it.
 *
 * A repertoire is a graph, not a tree: distinct move orders reach the same
 * position, and a line can even return to a position it already visited. The
 * visited set is therefore not an optimisation but a termination condition —
 * without it a repetition would loop forever.
 */
export function reachableFrom(
  graph: RepertoireGraph,
  rootKey: PositionKey,
): Set<PositionKey> {
  const seen = new Set<PositionKey>([rootKey]);
  const queue: PositionKey[] = [rootKey];

  while (queue.length > 0) {
    const key = queue.pop() as PositionKey;

    for (const edge of graph.get(key) ?? []) {
      if (seen.has(edge.toKey)) continue;

      seen.add(edge.toKey);
      queue.push(edge.toKey);
    }
  }

  return seen;
}

/**
 * Shortest distance in plies from the starting position to each position.
 *
 * Breadth-first, so a position reached by two move orders of different lengths
 * is reported at the shorter one — which is the honest answer to "how deep must
 * I know this line before I meet this position".
 */
export function depthsFrom(
  graph: RepertoireGraph,
  rootKey: PositionKey,
): Map<PositionKey, number> {
  const depths = new Map<PositionKey, number>([[rootKey, 0]]);
  let frontier: PositionKey[] = [rootKey];
  let depth = 0;

  while (frontier.length > 0) {
    depth += 1;
    const next: PositionKey[] = [];

    for (const key of frontier) {
      for (const edge of graph.get(key) ?? []) {
        if (depths.has(edge.toKey)) continue;

        depths.set(edge.toKey, depth);
        next.push(edge.toKey);
      }
    }

    frontier = next;
  }

  return depths;
}

/**
 * The shortest prepared line reaching a position, as moves in SAN.
 *
 * What makes a gap or a transposition navigable: given only a position, this
 * recovers a move order that arrives at it. Breadth-first, so the line returned
 * is the shortest one — the least the user has to click through.
 *
 * Returns an empty array for the starting position itself, and null when no
 * prepared line reaches the target at all.
 */
export function shortestLineTo(
  graph: RepertoireGraph,
  rootKey: PositionKey,
  targetKey: PositionKey,
): string[] | null {
  if (targetKey === rootKey) return [];

  const arrivedBy = new Map<PositionKey, { from: PositionKey; san: string }>();
  let frontier: PositionKey[] = [rootKey];
  const seen = new Set<PositionKey>([rootKey]);

  while (frontier.length > 0) {
    const next: PositionKey[] = [];

    for (const key of frontier) {
      for (const edge of graph.get(key) ?? []) {
        if (seen.has(edge.toKey)) continue;

        seen.add(edge.toKey);
        arrivedBy.set(edge.toKey, { from: key, san: edge.san });

        if (edge.toKey === targetKey) {
          // Walk the recorded arrivals back to the root, then reverse.
          const line: string[] = [];
          let cursor: PositionKey | undefined = targetKey;

          while (cursor !== undefined && cursor !== rootKey) {
            const step = arrivedBy.get(cursor);
            if (!step) break;

            line.push(step.san);
            cursor = step.from;
          }

          return line.reverse();
        }

        next.push(edge.toKey);
      }
    }

    frontier = next;
  }

  return null;
}

/**
 * Positions the repertoire reaches where the owner must move but has nothing
 * prepared.
 *
 * These are the actionable holes: the line runs out exactly where a decision is
 * required. Positions where the *opponent* is to move and no replies are
 * prepared are deliberately not counted — the opponent's options cannot be
 * enumerated, so every prepared line would end in an infinite list of
 * "missing" replies and the count would say nothing.
 *
 * Returned in the order positions were first reached, so shallow gaps — the
 * ones that matter soonest — come first.
 */
export function findGaps(
  graph: RepertoireGraph,
  rootKey: PositionKey,
  color: Color,
): PositionKey[] {
  const depths = depthsFrom(graph, rootKey);

  return [...depths.keys()]
    .filter(
      (key) =>
        isOwnerToMove(color, sideToMoveOf(key)) && (graph.get(key) ?? []).length === 0,
    )
    .sort((a, b) => (depths.get(a) as number) - (depths.get(b) as number));
}

/**
 * Moves that can no longer be reached from the starting position.
 *
 * Deleting one move can strand everything that followed it — but only if no
 * other line transposes into it, which is why orphans are found by reachability
 * rather than by walking down from the deleted move. Anything still reachable
 * by some other order is kept.
 */
export function orphanedMoves(
  moves: readonly RepertoireMove[],
  rootKey: PositionKey,
): RepertoireMove[] {
  const reachable = reachableFrom(buildRepertoireGraph(moves), rootKey);

  return moves.filter((move) => !reachable.has(move.fromKey));
}

export interface RepertoireStats {
  /** Prepared moves in total, counting each edge once. */
  moveCount: number;
  /** Distinct positions the repertoire covers. */
  positionCount: number;
  /** Longest shortest-path from the start, in plies. */
  maxDepth: number;
  /** Positions where the owner is to move with nothing prepared. */
  gapCount: number;
}

export function repertoireStats(
  moves: readonly RepertoireMove[],
  rootKey: PositionKey,
  color: Color,
): RepertoireStats {
  const graph = buildRepertoireGraph(moves);
  const depths = depthsFrom(graph, rootKey);

  return {
    moveCount: moves.length,
    positionCount: depths.size,
    maxDepth: Math.max(0, ...depths.values()),
    gapCount: findGaps(graph, rootKey, color).length,
  };
}
