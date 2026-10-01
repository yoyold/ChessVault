import Dexie from "dexie";
import type { PositionKey } from "@/core/chess/position-key";
import type { GameAnalysisRecord } from "@/core/domain/game-analysis";
import type { MistakeCardContent, TrainingCard } from "@/core/domain/training-card";
import type { MistakeSource } from "@/core/training/mistake-cards";
import { newReviewState, review, type Grade } from "@/core/training/scheduler";
import { db } from "@/persistence/db";
import { getEvaluations } from "./evaluation-repository";

export interface UpsertResult {
  added: number;
  updated: number;
}

/**
 * Write cards' content, keeping every card's review history.
 *
 * A card already known gets its content refreshed — a deeper analysis may have
 * found a different best move — but keeps its schedule, ease and history:
 * those are the user's work and cannot be derived again. A new card starts as
 * never reviewed, due straight away.
 *
 * When two games produce the same card, the more recent game becomes its
 * reference, so the card points at the latest time the mistake was made.
 */
export async function upsertCards(
  contents: readonly MistakeCardContent[],
  now: number,
): Promise<UpsertResult> {
  // The same position and move from two games in one batch is one card.
  const byId = new Map<string, MistakeCardContent>();
  for (const content of contents) {
    const seen = byId.get(content.id);
    if (!seen || content.dateIso > seen.dateIso) byId.set(content.id, content);
  }

  return db.transaction("rw", db.trainingCards, async () => {
    const ids = [...byId.keys()];
    const existing = await db.trainingCards.bulkGet(ids);

    let added = 0;
    let updated = 0;
    const cards: TrainingCard[] = ids.map((id, index) => {
      const content = byId.get(id) as MistakeCardContent;
      const current = existing[index];

      if (!current) {
        added += 1;
        return { ...content, ...newReviewState(now), createdAt: now };
      }

      updated += 1;
      const source = content.dateIso >= current.dateIso ? content : current;
      return {
        ...current,
        ...content,
        // Keep the reference to whichever game was the more recent.
        gameId: source.gameId,
        gameLabel: source.gameLabel,
        dateIso: source.dateIso,
      };
    });

    await db.trainingCards.bulkPut(cards);
    return { added, updated };
  });
}

/** Every card of a kind, in due order. */
export async function getCards(kind: TrainingCard["kind"]): Promise<TrainingCard[]> {
  return db.trainingCards
    .where("[kind+due]")
    .between([kind, Dexie.minKey], [kind, Dexie.maxKey])
    .toArray();
}

/**
 * Record an answer to a card and reschedule it.
 *
 * Read and written in one transaction, so two answers arriving together — two
 * open tabs — cannot both start from the same old state and lose one.
 *
 * @returns The card as rescheduled, or null if it no longer exists.
 */
export async function recordReview(
  id: string,
  grade: Grade,
  now: number,
): Promise<TrainingCard | null> {
  return db.transaction("rw", db.trainingCards, async () => {
    const card = await db.trainingCards.get(id);
    if (!card) return null;

    const reviewed: TrainingCard = { ...card, ...review(card, grade, now) };
    await db.trainingCards.put(reviewed);
    return reviewed;
  });
}

/** Remove a card the owner does not want to train — an engine quirk, say. */
export async function deleteCard(id: string): Promise<void> {
  await db.trainingCards.delete(id);
}

/** Games read per round trip when gathering mistake sources. */
const SOURCE_BATCH_SIZE = 200;

/**
 * Everything needed to find the training positions in a set of analysed games.
 *
 * Only what a card is built from is read: each game's owner and names, the
 * position keys and moves along it, and the evaluations of the positions just
 * before the owner's errors — not every evaluation in the game.
 */
export async function loadMistakeSources(
  analyses: readonly GameAnalysisRecord[],
): Promise<MistakeSource[]> {
  const sources: MistakeSource[] = [];

  for (let offset = 0; offset < analyses.length; offset += SOURCE_BATCH_SIZE) {
    const batch = analyses.slice(offset, offset + SOURCE_BATCH_SIZE);
    const ids = batch.map((analysis) => analysis.gameId);

    const [games, rows] = await Promise.all([
      db.games.bulkGet(ids),
      db.gamePositions
        .where("[gameId+ply]")
        .inAnyRange(
          ids.map((id) => [
            [id, Dexie.minKey],
            [id, Dexie.maxKey],
          ]),
        )
        .toArray(),
    ]);

    const positionsByGame = new Map<number, Map<number, { key: PositionKey; san: string | null }>>();
    for (const row of rows) {
      const positions = positionsByGame.get(row.gameId) ?? new Map();
      positions.set(row.ply, { key: row.key, san: row.san });
      positionsByGame.set(row.gameId, positions);
    }

    // Only the positions a card could start from need their evaluation.
    const keys = new Set<PositionKey>();
    for (const analysis of batch) {
      for (const error of analysis.errors) {
        const key = positionsByGame.get(analysis.gameId)?.get(error.ply - 1)?.key;
        if (key) keys.add(key);
      }
    }
    const evaluations = await getEvaluations([...keys]);

    batch.forEach((analysis, index) => {
      const game = games[index];
      if (!game?.playerColor) return;

      const opponent = game.playerColor === "white" ? game.black : game.white;
      sources.push({
        gameId: analysis.gameId,
        label: `vs ${opponent || "?"}${game.dateIso ? `, ${game.dateIso.slice(0, 4)}` : ""}`,
        dateIso: game.dateIso,
        playerColor: game.playerColor,
        analysis,
        positions: positionsByGame.get(analysis.gameId) ?? new Map(),
        evaluations,
      });
    });
  }

  return sources;
}
