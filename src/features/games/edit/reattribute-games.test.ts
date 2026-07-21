import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/persistence/db";
import { importPgn } from "@/features/games/import/import-games";
import { reattributeGames } from "./reattribute-games";

const GAMES = [
  '[Event "A"]\n[White "Dony, Lukas"]\n[Black "Klein, Tristan"]\n[Result "1-0"]\n[WhiteElo "1703"]\n[BlackElo "1650"]\n\n1.e4 e5 1-0',
  '[Event "B"]\n[White "Klemm, Julian"]\n[Black "Dony, Lukas"]\n[Result "0-1"]\n[WhiteElo "1800"]\n[BlackElo "1710"]\n\n1.d4 d5 0-1',
  '[Event "C"]\n[White "Carlsen, Magnus"]\n[Black "Firouzja, Alireza"]\n[Result "1-0"]\n\n1.c4 e5 1-0',
].join("\n\n");

beforeEach(async () => {
  await db.open();
  await Promise.all([
    db.games.clear(),
    db.gameContents.clear(),
    db.positions.clear(),
    db.gamePositions.clear(),
  ]);
});

describe("reattributeGames", () => {
  it("attributes games imported before any name was configured", async () => {
    // The situation this exists for: a collection imported straight away, with
    // settings still empty, is stored with no colour on any game.
    await importPgn(GAMES, { ownerNames: [] });
    expect(await db.games.filter((g) => g.playerColor === null).count()).toBe(3);

    const result = await reattributeGames(["Dony, Lukas"]);

    expect(result).toEqual({ examined: 3, updated: 2 });
    expect(await db.games.filter((g) => g.playerColor === null).count()).toBe(1);
  });

  it("derives the opponent and both ratings", async () => {
    await importPgn(GAMES, { ownerNames: [] });
    await reattributeGames(["Dony, Lukas"]);

    const asWhite = await db.games.where("event").equals("A").first();
    expect(asWhite).toMatchObject({
      playerColor: "white",
      opponent: "Klein, Tristan",
      opponentElo: 1650,
      playerElo: 1703,
    });

    const asBlack = await db.games.where("event").equals("B").first();
    expect(asBlack).toMatchObject({
      playerColor: "black",
      opponent: "Klemm, Julian",
      opponentElo: 1800,
      playerElo: 1710,
    });
  });

  it("leaves games the owner did not play unattributed", async () => {
    await importPgn(GAMES, { ownerNames: [] });
    await reattributeGames(["Dony, Lukas"]);

    const other = await db.games.where("event").equals("C").first();
    expect(other?.playerColor).toBeNull();
    expect(other?.opponent).toBeNull();
  });

  it("reports no changes when everything is already attributed", async () => {
    await importPgn(GAMES, { ownerNames: ["Dony, Lukas"] });

    expect(await reattributeGames(["Dony, Lukas"])).toEqual({
      examined: 3,
      updated: 0,
    });
  });

  it("removes attribution when a name is taken out of settings", async () => {
    // The operation reapplies the current names rather than only adding to
    // what is there, so correcting a wrong name actually corrects the data.
    await importPgn(GAMES, { ownerNames: ["Dony, Lukas"] });

    const result = await reattributeGames([]);

    expect(result.updated).toBe(2);
    expect(await db.games.filter((g) => g.playerColor === null).count()).toBe(3);
  });

  it("matches a differently formatted spelling of the same name", async () => {
    await importPgn(GAMES, { ownerNames: [] });

    const result = await reattributeGames(["Lukas Dony"]);
    expect(result.updated).toBe(2);
  });

  it("handles an empty database", async () => {
    expect(await reattributeGames(["Dony, Lukas"])).toEqual({
      examined: 0,
      updated: 0,
    });
  });
});
