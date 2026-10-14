import { sideToMoveOf, type PositionKey } from "@/core/chess/position-key";
import type { GameRecord } from "@/core/domain/game";
import type { PositionRecord } from "@/core/domain/position";
import type { RepertoireMove } from "@/core/domain/repertoire";
import { db } from "@/persistence/db";

export interface PositionNote {
  notes: string;
  tags: string[];
}

/** Whether anything was written: notes are only kept while there are some. */
function hasContent({ notes, tags }: PositionNote): boolean {
  return notes.trim() !== "" || tags.length > 0;
}

/**
 * The record with `notedAt` set, or removed when there is nothing noted.
 *
 * Removed rather than left empty: a record without the field is left out of
 * its index, which is what keeps the index to the annotated records.
 */
function stamped<Row extends { notedAt?: number }>(row: Row, notedAt: number | null): Row {
  const copy = { ...row };
  if (notedAt === null) delete copy.notedAt;
  else copy.notedAt = notedAt;
  return copy;
}

/** The owner's note on a position, or null when there is none. */
export async function getPositionNote(key: PositionKey): Promise<PositionNote | null> {
  const position = await db.positions.get(key);
  if (!position || !hasContent(position)) return null;
  return { notes: position.notes, tags: position.tags };
}

/**
 * Write the owner's note on a position.
 *
 * A note belongs to the position, not to a game: it shows in every game that
 * reaches the position, by whatever move order, and outlives deleting them.
 * A position only reached in a variation has no row yet, and gets one.
 *
 * Clearing a note keeps the row — it may be one the games link to — but drops
 * \`notedAt\`, which takes it out of the list of notes.
 */
export async function savePositionNote(
  key: PositionKey,
  note: PositionNote,
  now: number,
): Promise<void> {
  await db.transaction("rw", db.positions, async () => {
    const existing = await db.positions.get(key);
    if (!existing && !hasContent(note)) return;

    const record: PositionRecord = {
      ...(existing ?? {
        key,
        sideToMove: sideToMoveOf(key),
        firstSeenAt: now,
      }),
      notes: note.notes.trim(),
      tags: note.tags,
    };
    await db.positions.put(stamped(record, hasContent(record) ? now : null));
  });
}

/** Write a game's notes, keeping it in or out of the list of notes to match. */
export async function saveGameNotes(gameId: number, notes: string, now: number): Promise<void> {
  await db.transaction("rw", db.games, async () => {
    const game = await db.games.get(gameId);
    if (!game) return;

    await db.games.put(
      stamped({ ...game, notes, updatedAt: now }, notes.trim() !== "" ? now : null),
    );
  });
}

export interface PositionNoteEntry {
  kind: "position";
  key: PositionKey;
  notes: string;
  tags: string[];
  notedAt: number;
  /** How many games reach the position. */
  games: number;
  /** One of them, and where, to open the position on the board. */
  firstOccurrence: { gameId: number; ply: number } | null;
}

export interface GameNoteEntry {
  kind: "game";
  game: GameRecord & { id: number };
  notedAt: number;
}

export interface RepertoireNoteEntry {
  kind: "repertoire";
  move: RepertoireMove;
}

export interface AllNotes {
  positions: PositionNoteEntry[];
  games: GameNoteEntry[];
  repertoire: RepertoireNoteEntry[];
}

/**
 * Everything the owner has written: on positions, on games, on repertoire
 * moves.
 *
 * Positions and games are read through \`notedAt\`, which only annotated
 * records carry, so the cost is the notes, not the collection. Repertoire
 * moves are few enough to read whole.
 */
export async function getAllNotes(): Promise<AllNotes> {
  const [positions, games, moves] = await Promise.all([
    db.positions.orderBy("notedAt").reverse().toArray(),
    db.games.orderBy("notedAt").reverse().toArray(),
    db.repertoireMoves.filter((move) => move.note.trim() !== "").toArray(),
  ]);

  const occurrences = await Promise.all(
    positions.map(async (position) => {
      // A collection each: Dexie collections carry their state, and `first`
      // would leave a limit of one on a collection the count then reads.
      const rows = () => db.gamePositions.where("key").equals(position.key);
      const [count, first] = await Promise.all([rows().count(), rows().first()]);
      return { count, first };
    }),
  );

  return {
    positions: positions.map((position, index) => ({
      kind: "position",
      key: position.key,
      notes: position.notes,
      tags: position.tags,
      notedAt: position.notedAt ?? 0,
      games: occurrences[index].count,
      firstOccurrence: occurrences[index].first
        ? { gameId: occurrences[index].first.gameId, ply: occurrences[index].first.ply }
        : null,
    })),
    games: games.map((game) => ({
      kind: "game",
      game: game as GameRecord & { id: number },
      notedAt: game.notedAt ?? 0,
    })),
    repertoire: moves
      .sort((a, b) => b.addedAt - a.addedAt)
      .map((move) => ({ kind: "repertoire", move })),
  };
}
