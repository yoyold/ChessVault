import { Chess } from "chess.js";
import type { Color } from "@/core/domain/game";
import { positionKeyFromEngineFen, type PositionKey } from "@/core/chess/position-key";
import { REPERTOIRE_ROOT } from "@/core/domain/repertoire";
import {
  extractCandidates,
  type ExtractionGame,
  type RepertoireCandidate,
} from "@/core/repertoire/extraction";
import {
  buildRepertoireGraph,
  shortestLineTo,
} from "@/core/repertoire/repertoire-graph";
import { db } from "@/persistence/db";
import { addRepertoireMove } from "./repertoire-repository";

/** A candidate, plus whether the repertoire already contains it. */
export interface CandidateWithStatus extends RepertoireCandidate {
  inRepertoire: boolean;
}

export interface ExtractOptions {
  color: Color;
  /** How deep to look, in plies. */
  maxPly?: number;
}

/** Games read per round trip, so a large collection cannot exhaust memory. */
const GAME_BATCH_SIZE = 200;

const DEFAULT_MAX_PLY = 20;

/**
 * Derive repertoire candidates from the games the owner actually played.
 *
 * Reads the position table rather than reparsing PGN: every game's moves were
 * already extracted at import, keyed by position, which is exactly the shape
 * aggregation needs.
 *
 * Only the opening plies are loaded. `gamePositions` is keyed by
 * `[gameId+ply]`, so a bounded range per game reads just those rows instead of
 * pulling entire games in to discard most of them — the difference between
 * twenty rows and two hundred on every game.
 */
export async function extractRepertoireCandidates(
  options: ExtractOptions,
): Promise<CandidateWithStatus[]> {
  const maxPly = options.maxPly ?? DEFAULT_MAX_PLY;

  const games = await db.games
    .where("playerColor")
    .equals(options.color)
    .toArray();

  const shaped: ExtractionGame[] = [];

  for (let offset = 0; offset < games.length; offset += GAME_BATCH_SIZE) {
    const batch = games.slice(offset, offset + GAME_BATCH_SIZE);

    const rows = await db.gamePositions
      .where("[gameId+ply]")
      .inAnyRange(
        batch.map((game) => [
          [game.id as number, 0],
          [game.id as number, maxPly],
        ]),
        { includeLowers: true, includeUppers: true },
      )
      .toArray();

    const byGame = new Map<number, typeof rows>();
    for (const row of rows) {
      const list = byGame.get(row.gameId) ?? [];
      list.push(row);
      byGame.set(row.gameId, list);
    }

    for (const game of batch) {
      const positions = (byGame.get(game.id as number) ?? []).sort(
        (a, b) => a.ply - b.ply,
      );

      if (positions.length < 2) continue;

      shaped.push({
        playerColor: options.color,
        result: game.result,
        positions: positions.map((row) => ({ key: row.key, san: row.san })),
      });
    }
  }

  const candidates = extractCandidates(shaped, { maxPly });

  // Marked rather than filtered out: seeing that a line is already prepared is
  // as useful as seeing that it is not, and hiding them would make a repertoire
  // that is largely complete look empty.
  const existing = await db.repertoireMoves
    .where("color")
    .equals(options.color)
    .toArray();

  const known = new Set(existing.map((move) => `${move.fromKey}|${move.san}`));

  return candidates.map((candidate) => ({
    ...candidate,
    inRepertoire: known.has(`${candidate.fromKey}|${candidate.san}`),
  }));
}

export interface AdoptResult {
  added: number;
  /** Moves that were already prepared, so nothing was written for them. */
  skipped: number;
}

/**
 * Add candidates to the repertoire, together with the lines leading to them.
 *
 * Adopting a move on its own is not enough. A candidate ten plies deep starts
 * from a position nothing else reaches, so stored alone it would sit in the
 * table unreachable from the opening position — counted in the totals, marked
 * as covered, and invisible in the tree, because there is no way to navigate
 * to it. Choosing a line means the line, so the moves that lead there are
 * adopted with it.
 *
 * Every move goes through the same validated path a hand-entered one takes, so
 * an adopted move cannot bypass the legality check or arrive shaped differently
 * from one played on the board.
 *
 * @param chosen The candidates the user picked.
 * @param context The full candidate set, which is what the leading lines are
 *   resolved from. It must not be a filtered view: a prefix hidden by a
 *   "played at least three times" filter is still needed to reach what follows
 *   it. Defaults to `chosen`, which is correct when adopting everything.
 */
export async function adoptCandidates(
  chosen: readonly RepertoireCandidate[],
  context: readonly RepertoireCandidate[] = chosen,
): Promise<AdoptResult> {
  const graph = buildRepertoireGraph(
    context.map((candidate) => ({ ...candidate, priority: candidate.played })),
  );

  // Collected before writing so a move shared by several chosen lines is
  // considered once, and the counts report writes rather than attempts.
  const wanted = new Map<
    string,
    { color: Color; fromKey: PositionKey; fromFen: string; san: string }
  >();

  for (const candidate of chosen) {
    const prefix = shortestLineTo(graph, REPERTOIRE_ROOT, candidate.fromKey);
    if (prefix === null) continue;

    const board = new Chess();

    for (const san of [...prefix, candidate.san]) {
      const fromFen = board.fen();
      const fromKey = positionKeyFromEngineFen(fromFen);

      wanted.set(`${candidate.color}|${fromKey}|${san}`, {
        color: candidate.color,
        fromKey,
        fromFen,
        san,
      });

      board.move(san);
    }
  }

  let added = 0;
  let skipped = 0;

  for (const move of wanted.values()) {
    const existing = await db.repertoireMoves.get([
      move.color,
      move.fromKey,
      move.san,
    ]);

    if (existing) {
      skipped += 1;
      continue;
    }

    await addRepertoireMove({
      color: move.color,
      fromFen: move.fromFen,
      san: move.san,
    });
    added += 1;
  }

  return { added, skipped };
}
