import { beforeEach, describe, expect, it } from "vitest";
import type { OpeningCard } from "@/core/domain/training-card";
import { ENDGAME_DRILLS, type EndgameDrill } from "@/core/endgames/catalogue";
import { db } from "@/persistence/db";
import { getCards, recordReview } from "@/persistence/repositories/training-repository";
import { syncEndgameCards } from "./sync-endgame-cards";

const NOW = new Date(2026, 9, 14, 12, 0).getTime();

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe("syncEndgameCards", () => {
  it("makes a card for every drill", async () => {
    expect(await syncEndgameCards(NOW)).toMatchObject({ added: ENDGAME_DRILLS.length });
    expect((await getCards("endgame")).map((card) => card.drillId).sort()).toEqual(
      ENDGAME_DRILLS.map((drill) => drill.id).sort(),
    );
  });

  it("keeps progress on drills that did not change", async () => {
    await syncEndgameCards(NOW);
    await recordReview("endgame:lucena", "good", NOW);

    expect(await syncEndgameCards(NOW + 1000)).toEqual({
      added: 0,
      updated: ENDGAME_DRILLS.length,
      removed: 0,
    });
    expect((await db.trainingCards.get("endgame:lucena"))?.reviews).toBe(1);
  });

  it("starts a changed drill over and removes a retired one", async () => {
    await syncEndgameCards(NOW);
    await recordReview("endgame:lucena", "good", NOW);
    await recordReview("endgame:philidor", "good", NOW);

    const changed: EndgameDrill[] = ENDGAME_DRILLS.filter((drill) => drill.id !== "philidor").map(
      (drill) => (drill.id === "lucena" ? { ...drill, goal: { type: "mate" } } : drill),
    );
    expect(await syncEndgameCards(NOW + 1000, changed)).toMatchObject({ removed: 1 });

    expect(await db.trainingCards.get("endgame:philidor")).toBeUndefined();
    expect(await db.trainingCards.get("endgame:lucena")).toMatchObject({
      reviews: 0,
      goal: { type: "mate" },
    });
  });

  it("leaves other kinds of card alone", async () => {
    const opening: OpeningCard = {
      kind: "opening",
      id: "opening:white:k",
      color: "white",
      fen: "k 0 1",
      positionKey: "k" as never,
      previousUci: null,
      line: [],
      answers: ["e4"],
      due: NOW,
      interval: 0,
      ease: 2.5,
      streak: 0,
      lapses: 0,
      reviews: 0,
      firstReviewedAt: null,
      lastReviewedAt: null,
      createdAt: NOW,
    };
    await db.trainingCards.put(opening);

    await syncEndgameCards(NOW);

    expect(await getCards("opening")).toHaveLength(1);
  });
});
