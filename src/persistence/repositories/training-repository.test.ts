import { beforeEach, describe, expect, it } from "vitest";
import type { PositionKey } from "@/core/chess/position-key";
import type { MistakeCardContent } from "@/core/domain/training-card";
import { db } from "@/persistence/db";
import { deleteCard, getCards, recordReview, upsertCards } from "./training-repository";

const NOW = new Date(2026, 9, 7, 15, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

function content(overrides: Partial<MistakeCardContent> = {}): MistakeCardContent {
  return {
    kind: "mistake",
    id: "mistake:k1:Nf6",
    fen: "k1 0 3",
    positionKey: "k1" as PositionKey,
    previousUci: "f1c4",
    playedSan: "Nf6",
    bestUci: "g7g6",
    bestSan: "g6",
    quality: "blunder",
    scoreBefore: { type: "cp", value: 40 },
    gameId: 9,
    gameLabel: "Opp – Dony, 2026",
    dateIso: "2026-05-24",
    moveNumber: 3,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.open();
  await db.trainingCards.clear();
});

describe("upsertCards", () => {
  it("adds a new card as never reviewed and due at once", async () => {
    expect(await upsertCards([content()], NOW)).toEqual({ added: 1, updated: 0 });

    const [card] = await getCards("mistake");
    expect(card).toMatchObject({ id: "mistake:k1:Nf6", reviews: 0, due: NOW, createdAt: NOW });
  });

  it("refreshes a known card's content but keeps its history", async () => {
    // A deeper analysis may find a different best move; the user's progress
    // on the position is theirs and must survive that.
    await upsertCards([content()], NOW);
    await recordReview("mistake:k1:Nf6", "good", NOW);

    expect(await upsertCards([content({ bestUci: "d8e7", bestSan: "Qe7" })], NOW + DAY)).toEqual({
      added: 0,
      updated: 1,
    });

    const [card] = await getCards("mistake");
    expect(card).toMatchObject({ bestSan: "Qe7", reviews: 1, streak: 1, createdAt: NOW });
  });

  it("points a card at the most recent game that made the mistake", async () => {
    await upsertCards([content({ gameId: 9, dateIso: "2026-05-24" })], NOW);
    await upsertCards([content({ gameId: 3, dateIso: "2024-01-01", gameLabel: "older" })], NOW);
    expect((await getCards("mistake"))[0].gameId).toBe(9);

    await upsertCards([content({ gameId: 12, dateIso: "2026-09-01", gameLabel: "newer" })], NOW);
    expect((await getCards("mistake"))[0]).toMatchObject({ gameId: 12, gameLabel: "newer" });
  });

  it("merges the same card arriving twice in one batch", async () => {
    const result = await upsertCards(
      [content({ gameId: 1, dateIso: "2025-01-01" }), content({ gameId: 2, dateIso: "2026-01-01" })],
      NOW,
    );

    expect(result).toEqual({ added: 1, updated: 0 });
    expect((await getCards("mistake"))[0].gameId).toBe(2);
  });
});

describe("recordReview", () => {
  it("reschedules a card", async () => {
    await upsertCards([content()], NOW);

    const reviewed = await recordReview("mistake:k1:Nf6", "good", NOW);

    expect(reviewed?.interval).toBe(1);
    expect((await getCards("mistake"))[0].due).toBeGreaterThan(NOW);
  });

  it("returns null for a card that no longer exists", async () => {
    expect(await recordReview("mistake:gone:e4", "good", NOW)).toBeNull();
  });
});

describe("getCards", () => {
  it("returns cards in due order", async () => {
    await upsertCards(
      [content({ id: "a" }), content({ id: "b" }), content({ id: "c" })],
      NOW,
    );
    await recordReview("a", "good", NOW); // tomorrow
    await recordReview("b", "again", NOW); // in ten minutes

    expect((await getCards("mistake")).map((card) => card.id)).toEqual(["c", "b", "a"]);
  });
});

describe("deleteCard", () => {
  it("removes a card", async () => {
    await upsertCards([content()], NOW);
    await deleteCard("mistake:k1:Nf6");

    expect(await getCards("mistake")).toEqual([]);
  });
});
