import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/persistence/db";
import { parseGameTree, mainline } from "@/core/chess/pgn/parse-tree";
import { addMove, withComments, withNags } from "@/core/chess/pgn/edit-tree";
import { getFullGame } from "@/persistence/repositories/game-repository";
import { importPgn } from "@/features/games/import/import-games";
import { persistGame } from "./save-game";

const GAME =
  '[Event "Club"]\n[White "Dony, Lukas"]\n[Black "Opponent"]\n[Result "1-0"]\n\n1.e4 e5 2.Nf3 Nc6 1-0';

beforeEach(async () => {
  await db.open();
  await Promise.all([
    db.games.clear(),
    db.gameContents.clear(),
    db.positions.clear(),
    db.gamePositions.clear(),
  ]);
});

/** Import the sample game and return its id and parsed tree. */
async function seedGame() {
  await importPgn(GAME, { ownerNames: ["Dony, Lukas"] });
  const record = await db.games.toCollection().first();
  const content = await db.gameContents.get(record!.id as number);

  return { id: record!.id as number, tree: parseGameTree(content!.pgn) };
}

describe("persistGame", () => {
  it("creates a new game", async () => {
    const tree = parseGameTree(GAME);
    const id = await persistGame({
      headers: tree.headers,
      root: tree.root,
      ownerNames: ["Dony, Lukas"],
    });

    const saved = await getFullGame(id);
    expect(saved?.record.white).toBe("Dony, Lukas");
    expect(saved?.record.playerColor).toBe("white");
  });

  it("stores an added comment so it survives a reload", async () => {
    const { id, tree } = await seedGame();

    await persistGame({
      headers: tree.headers,
      root: withComments(tree.root, [0], ["a strong start"]),
      ownerNames: ["Dony, Lukas"],
      gameId: id,
    });

    const saved = await getFullGame(id);
    const reloaded = parseGameTree(saved!.content.pgn);

    expect(mainline(reloaded.root)[1].comments).toEqual(["a strong start"]);
  });

  it("stores annotation glyphs", async () => {
    const { id, tree } = await seedGame();

    await persistGame({
      headers: tree.headers,
      root: withNags(tree.root, [0], [1]),
      ownerNames: ["Dony, Lukas"],
      gameId: id,
    });

    const reloaded = parseGameTree((await getFullGame(id))!.content.pgn);
    expect(mainline(reloaded.root)[1].nags).toEqual([1]);
  });

  it("stores an added variation", async () => {
    const { id, tree } = await seedGame();
    const withVariation = addMove(tree.root, [0, 0], "Bc4")!.root;

    await persistGame({
      headers: tree.headers,
      root: withVariation,
      ownerNames: ["Dony, Lukas"],
      gameId: id,
    });

    const reloaded = parseGameTree((await getFullGame(id))!.content.pgn);
    const branch = mainline(reloaded.root)[2];

    expect(branch.children.map((c) => c.san)).toEqual(["Nf3", "Bc4"]);
  });

  it("does not create a second game when editing an existing one", async () => {
    const { id, tree } = await seedGame();

    await persistGame({
      headers: tree.headers,
      root: withComments(tree.root, [0], ["note"]),
      ownerNames: ["Dony, Lukas"],
      gameId: id,
    });

    expect(await db.games.count()).toBe(1);
  });

  describe("what an edit must not destroy", () => {
    it("keeps tags and notes, which are not derived from the file", async () => {
      const { id, tree } = await seedGame();
      await db.games.update(id, { tags: ["studied"], notes: "my analysis" });

      await persistGame({
        headers: tree.headers,
        root: withComments(tree.root, [0], ["note"]),
        ownerNames: ["Dony, Lukas"],
        gameId: id,
      });

      const saved = await db.games.get(id);
      expect(saved?.tags).toEqual(["studied"]);
      expect(saved?.notes).toBe("my analysis");
    });

    it("keeps the original import time", async () => {
      const { id, tree } = await seedGame();
      await db.games.update(id, { importedAt: 1 });

      await persistGame({
        headers: tree.headers,
        root: tree.root,
        ownerNames: ["Dony, Lukas"],
        gameId: id,
      });

      expect((await db.games.get(id))?.importedAt).toBe(1);
    });
  });

  describe("position rows", () => {
    it("replaces them so the game is not findable by positions it no longer reaches", async () => {
      const { id, tree } = await seedGame();

      // Truncate the game to its first move.
      const shortened = { ...tree.root, children: [
        { ...tree.root.children[0], children: [] },
      ] };

      await persistGame({
        headers: tree.headers,
        root: shortened,
        ownerNames: ["Dony, Lukas"],
        gameId: id,
      });

      // Start plus one move.
      expect(await db.gamePositions.where("gameId").equals(id).count()).toBe(2);
    });

    it("records positions reached by a newly added move", async () => {
      const { id, tree } = await seedGame();
      const extended = addMove(tree.root, [0, 0, 0, 0], "Bb5")!.root;

      await persistGame({
        headers: tree.headers,
        root: extended,
        ownerNames: ["Dony, Lukas"],
        gameId: id,
      });

      expect(await db.gamePositions.where("gameId").equals(id).count()).toBe(6);
    });

    it("does not index positions that exist only in a variation", async () => {
      // The position database describes games as played; a sideline is
      // analysis, and indexing it would make the game match positions it never
      // actually reached.
      const { id, tree } = await seedGame();
      const branched = addMove(tree.root, [0, 0], "Bc4")!.root;

      await persistGame({
        headers: tree.headers,
        root: branched,
        ownerNames: ["Dony, Lukas"],
        gameId: id,
      });

      expect(await db.gamePositions.where("gameId").equals(id).count()).toBe(5);
    });
  });

  it("re-projects metadata when a header changes", async () => {
    const { id, tree } = await seedGame();

    await persistGame({
      headers: { ...tree.headers, Event: "Renamed Open", WhiteElo: "1700" },
      root: tree.root,
      ownerNames: ["Dony, Lukas"],
      gameId: id,
    });

    const saved = await db.games.get(id);
    expect(saved?.event).toBe("Renamed Open");
    expect(saved?.whiteElo).toBe(1700);
    expect(saved?.playerElo).toBe(1700);
  });
});
