import { beforeEach, describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { parseGame } from "@/core/chess/pgn/parse-game";
import { positionKey, type PositionKey } from "@/core/chess/position-key";
import type { GameRecord } from "@/core/domain/game";
import { db } from "@/persistence/db";
import { addRepertoireMove } from "./repertoire-repository";
import { deleteGame, persistGameBatch } from "./game-repository";
import {
  getAllNotes,
  getPositionNote,
  saveGameNotes,
  savePositionNote,
} from "./notes-repository";

const NOW = new Date(2026, 9, 14, 12, 0).getTime();

/**
 * Store games as an import would, without going through it: the import
 * pipeline sits a layer above persistence.
 */
async function seedGames(...movetexts: string[]): Promise<void> {
  await persistGameBatch(
    movetexts.map((movetext, index) => {
      const pgn = `[White "Me"]\n[Black "Opp ${index}"]\n\n${movetext} *`;
      const parsed = parseGame(pgn);
      const record: GameRecord = {
        contentHash: `hash-${index}`,
        white: "Me",
        black: `Opp ${index}`,
        result: "*",
        dateIso: "2026-01-01",
        event: null,
        site: null,
        round: null,
        eco: null,
        opening: null,
        timeControl: null,
        playerColor: "white",
        whiteElo: null,
        blackElo: null,
        opponent: `Opp ${index}`,
        opponentElo: null,
        playerElo: null,
        tags: [],
        notes: "",
        plyCount: parsed.plyCount,
        finalFen: parsed.finalFen,
        importedAt: 1,
        updatedAt: 1,
      };
      return { record, content: { pgn, headers: parsed.headers }, positions: parsed.positions };
    }),
  );
}

/** Two games reaching the same position by different move orders. */
const seed = () => seedGames("1. e4 e5 2. Nf3 Nc6", "1. Nf3 Nc6 2. e4 e5");

/** The position after these moves. */
function keyAfter(...moves: string[]): PositionKey {
  const board = new Chess();
  for (const move of moves) board.move(move);
  return positionKey(board);
}

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe("position notes", () => {
  it("are kept on the position, whichever game reaches it", async () => {
    await seed();
    // Both games reach this position, by different move orders.
    const key = keyAfter("e4", "e5", "Nf3", "Nc6");

    await savePositionNote(key, { notes: "Italian or Spanish?", tags: ["open games"] }, NOW);

    expect(await getPositionNote(key)).toEqual({
      notes: "Italian or Spanish?",
      tags: ["open games"],
    });
    const [entry] = (await getAllNotes()).positions;
    expect(entry).toMatchObject({ key, games: 2, notedAt: NOW });
    expect(entry.firstOccurrence).toMatchObject({ ply: 4 });
  });

  it("can be written on a position no game has reached", async () => {
    const key = keyAfter("d4", "d5", "c4");

    await savePositionNote(key, { notes: "Queen's Gambit", tags: [] }, NOW);

    expect(await db.positions.get(key)).toMatchObject({ sideToMove: "b", notes: "Queen's Gambit" });
    expect((await getAllNotes()).positions[0]).toMatchObject({ games: 0, firstOccurrence: null });
  });

  it("leave the list when cleared, while the position stays", async () => {
    await seed();
    const key = keyAfter("e4");
    await savePositionNote(key, { notes: "King's pawn", tags: [] }, NOW);

    await savePositionNote(key, { notes: "  ", tags: [] }, NOW + 1);

    expect(await getPositionNote(key)).toBeNull();
    expect((await getAllNotes()).positions).toEqual([]);
    expect(await db.positions.get(key)).not.toHaveProperty("notedAt");
  });

  it("does not create a row just to say nothing", async () => {
    const key = keyAfter("g4");

    await savePositionNote(key, { notes: "", tags: [] }, NOW);

    expect(await db.positions.get(key)).toBeUndefined();
  });

  it("outlive the games that reached the position", async () => {
    await seed();
    const key = keyAfter("e4", "e5");
    await savePositionNote(key, { notes: "Symmetry", tags: [] }, NOW);

    for (const game of await db.games.toArray()) await deleteGame(game.id as number);

    expect((await getAllNotes()).positions[0]).toMatchObject({ notes: "Symmetry", games: 0 });
  });

  it("are listed newest first", async () => {
    await savePositionNote(keyAfter("e4"), { notes: "older", tags: [] }, NOW);
    await savePositionNote(keyAfter("d4"), { notes: "newer", tags: [] }, NOW + 1000);

    expect((await getAllNotes()).positions.map((entry) => entry.notes)).toEqual([
      "newer",
      "older",
    ]);
  });
});

describe("game notes", () => {
  it("are listed while there are any", async () => {
    await seed();
    const [first] = await db.games.toArray();

    await saveGameNotes(first.id as number, "Missed 12.Nxe5", NOW);
    expect((await getAllNotes()).games).toEqual([
      expect.objectContaining({ notedAt: NOW, game: expect.objectContaining({ notes: "Missed 12.Nxe5" }) }),
    ]);

    await saveGameNotes(first.id as number, "", NOW + 1);
    expect((await getAllNotes()).games).toEqual([]);
  });
});

describe("repertoire notes", () => {
  it("are listed with the move they belong to", async () => {
    await addRepertoireMove({
      color: "white",
      fromFen: new Chess().fen(),
      san: "e4",
      note: "Best by test",
    });
    await addRepertoireMove({ color: "white", fromFen: new Chess().fen(), san: "d4" });

    const { repertoire } = await getAllNotes();
    expect(repertoire.map((entry) => entry.move.san)).toEqual(["e4"]);
  });
});
