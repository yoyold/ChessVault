import { Chess } from "chess.js";
import { positionKeyFromEngineFen, type PositionKey } from "@/core/chess/position-key";
import type { Color } from "@/core/domain/game";
import { REPERTOIRE_ROOT, type RepertoireMove } from "@/core/domain/repertoire";
import { orphanedMoves } from "@/core/repertoire/repertoire-graph";
import { db } from "@/persistence/db";

/** Raised when a move is not legal in the position it was offered for. */
export class IllegalRepertoireMoveError extends Error {
  constructor(san: string) {
    super(`${san} is not legal in this position.`);
    this.name = "IllegalRepertoireMoveError";
  }
}

export interface AddMoveInput {
  color: Color;
  /** Full FEN of the position the move is played from. */
  fromFen: string;
  /** The move, in SAN as the board reports it. */
  san: string;
  note?: string;
  priority?: number;
}

/**
 * Add a move to a repertoire, or return the one already there.
 *
 * Idempotent by design: the compound primary key is `[color+fromKey+san]`, so
 * replaying a line already prepared updates rather than duplicates. An existing
 * note and priority are preserved — walking back through a line to look at it
 * must never quietly erase what was written about it, the same rule that keeps
 * position annotations safe across a re-import.
 *
 * @throws IllegalRepertoireMoveError if the move is not legal in the position.
 */
export async function addRepertoireMove(
  input: AddMoveInput,
): Promise<RepertoireMove> {
  const board = new Chess(input.fromFen);
  const fromKey = positionKeyFromEngineFen(board.fen());

  let played;
  try {
    played = board.move(input.san);
  } catch {
    throw new IllegalRepertoireMoveError(input.san);
  }

  const key: [Color, PositionKey, string] = [input.color, fromKey, played.san];

  return db.transaction("rw", db.repertoireMoves, async () => {
    const existing = await db.repertoireMoves.get(key);

    const move: RepertoireMove = {
      color: input.color,
      fromKey,
      san: played.san,
      uci: played.lan,
      toKey: positionKeyFromEngineFen(board.fen()),
      note: input.note ?? existing?.note ?? "",
      priority: input.priority ?? existing?.priority ?? 0,
      addedAt: existing?.addedAt ?? Date.now(),
    };

    await db.repertoireMoves.put(move);
    return move;
  });
}

/** One prepared move, or undefined if it is not in the repertoire. */
export async function getRepertoireMove(
  color: Color,
  fromKey: PositionKey,
  san: string,
): Promise<RepertoireMove | undefined> {
  return db.repertoireMoves.get([color, fromKey, san]);
}

/** Every move prepared in one repertoire. */
export async function getRepertoire(color: Color): Promise<RepertoireMove[]> {
  return db.repertoireMoves.where("color").equals(color).toArray();
}

/**
 * The moves prepared from one position, best first.
 *
 * The single query the tree view makes as the user walks through lines, which
 * is why `[color+fromKey]` is indexed.
 */
export async function getContinuations(
  color: Color,
  fromKey: PositionKey,
): Promise<RepertoireMove[]> {
  const moves = await db.repertoireMoves
    .where("[color+fromKey]")
    .equals([color, fromKey])
    .toArray();

  return moves.sort((a, b) => b.priority - a.priority || a.san.localeCompare(b.san));
}

/**
 * Prepared moves that arrive at a position.
 *
 * The reverse lookup, so a position on the analysis board can report that the
 * repertoire already covers it — including by a move order the user did not
 * take to get there.
 */
export async function getMovesReaching(
  color: Color,
  toKey: PositionKey,
): Promise<RepertoireMove[]> {
  return db.repertoireMoves.where("[color+toKey]").equals([color, toKey]).toArray();
}

/** Change the note or priority of a prepared move. */
export async function updateRepertoireMove(
  color: Color,
  fromKey: PositionKey,
  san: string,
  patch: Partial<Pick<RepertoireMove, "note" | "priority">>,
): Promise<void> {
  await db.repertoireMoves.update([color, fromKey, san], patch);
}

export interface DeleteResult {
  /** Moves removed in total, including anything stranded by the deletion. */
  removed: number;
}

/**
 * Remove a prepared move, and anything the deletion strands.
 *
 * Orphans are found by reachability from the root, not by walking down from the
 * deleted move: a continuation that some other move order still reaches is not
 * stranded and must survive. Walking downwards would delete it.
 */
export async function deleteRepertoireMove(
  color: Color,
  fromKey: PositionKey,
  san: string,
): Promise<DeleteResult> {
  return db.transaction("rw", db.repertoireMoves, async () => {
    await db.repertoireMoves.delete([color, fromKey, san]);

    const remaining = await db.repertoireMoves.where("color").equals(color).toArray();
    const orphans = orphanedMoves(remaining, REPERTOIRE_ROOT);

    if (orphans.length > 0) {
      await db.repertoireMoves.bulkDelete(
        orphans.map((move) => [move.color, move.fromKey, move.san] as const),
      );
    }

    return { removed: 1 + orphans.length };
  });
}

/** Remove an entire repertoire. */
export async function clearRepertoire(color: Color): Promise<void> {
  await db.repertoireMoves.where("color").equals(color).delete();
}
