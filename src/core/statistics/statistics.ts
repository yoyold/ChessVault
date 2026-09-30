import type { Color, GameResult } from "@/core/domain/game";
import { outcomeFor, type GameOutcome } from "@/core/domain/game-outcome";
import {
  countOutcome,
  emptyCounts,
  finishTally,
  type OutcomeTally,
} from "@/core/domain/outcome-tally";
import { expectedScore, performanceRating } from "./rating";

/**
 * What the statistics need of a game, and nothing else.
 *
 * A subset of the stored record, so a whole collection can be held in memory
 * for aggregation without its position data, text or notes coming along.
 * Only games the owner played are statistics about the owner, so the colour is
 * required rather than nullable.
 */
export interface StatGame {
  id: number;
  result: GameResult;
  playerColor: Color;
  /** `YYYY-MM-DD`, or empty when the game carries no usable date. */
  dateIso: string;
  eco: string | null;
  opening: string | null;
  event: string | null;
  playerElo: number | null;
  opponentElo: number | null;
}

/** Inclusive bounds as `YYYY-MM-DD`. An absent bound is open. */
export interface Period {
  from?: string;
  to?: string;
}

/**
 * A result measured against the opposition it was achieved against.
 *
 * Rests only on decided games where both ratings are known, which is usually
 * fewer than the games in the tally beside it — `games` says how many, so a
 * performance built on three games is not read like one built on sixty.
 */
export interface RatingSummary {
  games: number;
  averageOpponent: number | null;
  performance: number | null;
  /** Points per game the ratings predicted, over those games. */
  expected: number | null;
  /** Points per game actually scored, over the same games. */
  actual: number | null;
}

/** A set of games: how they went, and what that was worth. */
export interface Breakdown {
  tally: OutcomeTally;
  rating: RatingSummary;
}

export interface OpeningRow extends Breakdown {
  color: Color;
  /** Null for games that carry no ECO code. */
  eco: string | null;
  /** The name most often attached to this code in the collection, if any. */
  name: string | null;
}

/**
 * Opponents grouped by how their rating compared with the owner's at the time.
 *
 * The width of the middle band is a judgement: within fifty points the ratings
 * predict close to an even game, so it reads as "my own level".
 */
export const RATING_BANDS = [
  { id: "much-lower", label: "200+ lower" },
  { id: "lower", label: "50–199 lower" },
  { id: "similar", label: "Within 50" },
  { id: "higher", label: "50–199 higher" },
  { id: "much-higher", label: "200+ higher" },
] as const;

export type RatingBandId = (typeof RATING_BANDS)[number]["id"];

export interface BandRow extends Breakdown {
  band: RatingBandId;
  label: string;
}

export interface YearRow extends Breakdown {
  year: string;
}

export interface EventRow extends Breakdown {
  event: string;
  /** Date of the latest game, for ordering tournaments most recent first. */
  lastDate: string;
}

export interface RatingPoint {
  dateIso: string;
  rating: number;
}

export interface Statistics {
  total: Breakdown;
  byColor: Record<Color, Breakdown>;
  /** Most played first. */
  openings: OpeningRow[];
  /** Always all five bands, weakest opposition first, so the table keeps its shape. */
  bands: BandRow[];
  /** Newest first. */
  years: YearRow[];
  /** Most recent first. */
  events: EventRow[];
  /** The owner's own rating over time, oldest first, one point per day. */
  ratingHistory: RatingPoint[];
  /** Games left out because a period was asked for and they carry no date. */
  undatedExcluded: number;
}

/** Which band an opponent falls into. */
export function ratingBand(ownRating: number, opponentRating: number): RatingBandId {
  const difference = opponentRating - ownRating;

  if (difference <= -200) return "much-lower";
  if (difference <= -50) return "lower";
  if (difference < 50) return "similar";
  if (difference < 200) return "higher";
  return "much-higher";
}

const POINTS: Record<GameOutcome, number> = { win: 1, draw: 0.5, loss: 0 };

/** Running totals for one group of games. */
interface Accumulator {
  counts: ReturnType<typeof emptyCounts>;
  rated: number;
  opponentSum: number;
  expectedSum: number;
  pointsSum: number;
}

function accumulator(): Accumulator {
  return { counts: emptyCounts(), rated: 0, opponentSum: 0, expectedSum: 0, pointsSum: 0 };
}

function add(target: Accumulator, game: StatGame, outcome: GameOutcome | null): void {
  countOutcome(target.counts, outcome);

  // An unfinished game has no score to compare with the expectation, and a
  // game with a rating missing has no expectation to compare it with.
  if (outcome === null || game.playerElo === null || game.opponentElo === null) return;

  target.rated += 1;
  target.opponentSum += game.opponentElo;
  target.expectedSum += expectedScore(game.playerElo, game.opponentElo);
  target.pointsSum += POINTS[outcome];
}

function finish(source: Accumulator): Breakdown {
  if (source.rated === 0) {
    return {
      tally: finishTally(source.counts),
      rating: { games: 0, averageOpponent: null, performance: null, expected: null, actual: null },
    };
  }

  const averageOpponent = source.opponentSum / source.rated;
  const actual = source.pointsSum / source.rated;

  return {
    tally: finishTally(source.counts),
    rating: {
      games: source.rated,
      averageOpponent: Math.round(averageOpponent),
      performance: performanceRating(averageOpponent, actual),
      expected: source.expectedSum / source.rated,
      actual,
    },
  };
}

/** Get or create the accumulator for a key. */
function bucket<K>(map: Map<K, Accumulator>, key: K): Accumulator {
  let found = map.get(key);
  if (!found) {
    found = accumulator();
    map.set(key, found);
  }
  return found;
}

export function inPeriod(dateIso: string, period: Period): boolean {
  // ISO dates order as text, so plain comparison is a date comparison.
  if (period.from !== undefined && dateIso < period.from) return false;
  if (period.to !== undefined && dateIso > period.to) return false;
  return true;
}

/** The entry that occurs most often; ties go to the alphabetically first. */
export function mostCommon(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;

  for (const [value, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && value < best)) {
      best = value;
      bestCount = count;
    }
  }

  return best;
}

/**
 * Aggregate the owner's games into everything the statistics page shows.
 *
 * One pass over the games, whatever the size of the collection: each game is
 * added to every group it belongs to as it goes by, so the cost is the number
 * of games and not the number of games times the number of tables.
 *
 * Pure, so it can be tested without a database and re-run instantly when the
 * period changes — the games are loaded once and filtered here.
 */
export function buildStatistics(games: Iterable<StatGame>, period: Period = {}): Statistics {
  const bounded = period.from !== undefined || period.to !== undefined;

  const total = accumulator();
  const byColor: Record<Color, Accumulator> = { white: accumulator(), black: accumulator() };
  const openings = new Map<string, Accumulator>();
  const openingNames = new Map<string, Map<string, number>>();
  const bands = new Map<RatingBandId, Accumulator>();
  const years = new Map<string, Accumulator>();
  const events = new Map<string, Accumulator>();
  const eventDates = new Map<string, string>();
  const ratingByDay = new Map<string, number>();
  let undatedExcluded = 0;

  for (const game of games) {
    if (bounded) {
      // A game with no date cannot be placed inside or outside a period, so it
      // is left out and counted, rather than silently assigned to either.
      if (game.dateIso === "") {
        undatedExcluded += 1;
        continue;
      }
      if (!inPeriod(game.dateIso, period)) continue;
    }

    const outcome = outcomeFor(game.playerColor, game.result);

    add(total, game, outcome);
    add(byColor[game.playerColor], game, outcome);

    // The same code means a different opening depending on the side, so the
    // colour is part of what an opening is here.
    const openingKey = `${game.playerColor}|${game.eco ?? ""}`;
    add(bucket(openings, openingKey), game, outcome);
    if (game.opening) {
      const names = openingNames.get(openingKey) ?? new Map<string, number>();
      names.set(game.opening, (names.get(game.opening) ?? 0) + 1);
      openingNames.set(openingKey, names);
    }

    if (game.playerElo !== null && game.opponentElo !== null) {
      add(bucket(bands, ratingBand(game.playerElo, game.opponentElo)), game, outcome);
    }

    if (game.dateIso !== "") {
      add(bucket(years, game.dateIso.slice(0, 4)), game, outcome);

      // One point per day: the last game of a day wins, which for a rating
      // that only changes between events is simply that day's rating.
      if (game.playerElo !== null) ratingByDay.set(game.dateIso, game.playerElo);
    }

    if (game.event) {
      add(bucket(events, game.event), game, outcome);
      if (game.dateIso > (eventDates.get(game.event) ?? "")) {
        eventDates.set(game.event, game.dateIso);
      }
    }
  }

  return {
    total: finish(total),
    byColor: { white: finish(byColor.white), black: finish(byColor.black) },

    openings: [...openings.entries()]
      .map(([key, value]) => {
        const [color, eco] = key.split("|") as [Color, string];
        return {
          color,
          eco: eco === "" ? null : eco,
          name: mostCommon(openingNames.get(key) ?? new Map()),
          ...finish(value),
        };
      })
      .sort(
        (a, b) =>
          b.tally.games - a.tally.games || (a.eco ?? "~").localeCompare(b.eco ?? "~"),
      ),

    bands: RATING_BANDS.map(({ id, label }) => ({
      band: id,
      label,
      ...finish(bands.get(id) ?? accumulator()),
    })),

    years: [...years.entries()]
      .map(([year, value]) => ({ year, ...finish(value) }))
      .sort((a, b) => b.year.localeCompare(a.year)),

    events: [...events.entries()]
      .map(([event, value]) => ({
        event,
        lastDate: eventDates.get(event) ?? "",
        ...finish(value),
      }))
      .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.event.localeCompare(b.event)),

    ratingHistory: [...ratingByDay.entries()]
      .map(([dateIso, rating]) => ({ dateIso, rating }))
      .sort((a, b) => a.dateIso.localeCompare(b.dateIso)),

    undatedExcluded,
  };
}
