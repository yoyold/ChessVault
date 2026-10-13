import { beforeEach, describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import type { Color } from "@/core/domain/game";
import { db } from "@/persistence/db";
import {
  addRepertoireMove,
  deleteRepertoireMove,
} from "@/persistence/repositories/repertoire-repository";
import {
  getCards,
  recordReview,
  upsertCards,
} from "@/persistence/repositories/training-repository";
import { syncOpeningCards } from "./sync-opening-cards";

const NOW = new Date(2026, 9, 13, 18, 0).getTime();

/** Prepare a line move by move, as the repertoire view does. */
async function prepare(color: Color, line: string[]): Promise<void> {
  const board = new Chess();
  for (const san of line) {
    await addRepertoireMove({ color, fromFen: board.fen(), san });
    board.move(san);
  }
}

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe("syncOpeningCards", () => {
  it("makes cards for both repertoires", async () => {
    await prepare("white", ["e4", "c5", "Nf3"]);
    await prepare("black", ["e4", "e5"]);

    expect(await syncOpeningCards(NOW)).toEqual({ added: 3, updated: 0, removed: 0 });

    const cards = await getCards("opening");
    expect(cards.map((card) => [card.color, card.answers])).toEqual(
      expect.arrayContaining([
        ["white", ["e4"]],
        ["white", ["Nf3"]],
        ["black", ["e5"]],
      ]),
    );
    expect(cards.every((card) => card.reviews === 0 && card.due === NOW)).toBe(true);
  });

  it("keeps progress on cards whose answer is unchanged", async () => {
    await prepare("white", ["e4", "c5", "Nf3"]);
    await syncOpeningCards(NOW);
    const [first] = await getCards("opening");
    await recordReview(first.id, "good", NOW);

    // Something else in the repertoire grows.
    await prepare("white", ["e4", "e5", "Nf3"]);
    expect(await syncOpeningCards(NOW)).toEqual({ added: 1, updated: 2, removed: 0 });

    const kept = (await getCards("opening")).find((card) => card.id === first.id);
    expect(kept?.reviews).toBe(1);
  });

  it("starts a card over when its answer changes", async () => {
    await prepare("white", ["e4", "c5", "Nf3"]);
    await syncOpeningCards(NOW);
    const sicilian = (await getCards("opening")).find((card) => card.answers[0] === "Nf3")!;
    await recordReview(sicilian.id, "good", NOW);

    // The main move against the Sicilian is now 2.c3.
    await prepare("white", ["e4", "c5", "c3"]);
    await deleteRepertoireMove("white", sicilian.positionKey, "Nf3");
    await syncOpeningCards(NOW + 1000);

    const changed = (await getCards("opening")).find((card) => card.id === sicilian.id)!;
    expect(changed).toMatchObject({ answers: ["c3"], reviews: 0, due: NOW + 1000 });
  });

  it("removes cards whose position left the repertoire", async () => {
    await prepare("white", ["e4", "c5", "Nf3"]);
    await syncOpeningCards(NOW);

    // Deleting 1...c5 strands 2.Nf3 behind it.
    const fromKey = (await db.repertoireMoves.toArray()).find((move) => move.san === "c5")!.fromKey;
    await deleteRepertoireMove("white", fromKey, "c5");

    expect(await syncOpeningCards(NOW)).toEqual({ added: 0, updated: 1, removed: 1 });
    expect((await getCards("opening")).map((card) => card.answers)).toEqual([["e4"]]);
  });

  it("leaves mistake cards alone", async () => {
    await upsertCards(
      [
        {
          kind: "mistake",
          id: "mistake:k:Nf6",
          fen: "k 0 3",
          positionKey: "k" as never,
          previousUci: null,
          playedSan: "Nf6",
          bestUci: "g7g6",
          bestSan: "g6",
          quality: "blunder",
          scoreBefore: { type: "cp", value: 0 },
          gameId: 1,
          gameLabel: "vs Opp, 2026",
          dateIso: "2026-05-24",
          moveNumber: 3,
        },
      ],
      NOW,
    );

    await syncOpeningCards(NOW);

    expect(await getCards("mistake")).toHaveLength(1);
  });
});
