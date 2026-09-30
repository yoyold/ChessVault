import type { ColourSummary } from "@/core/analysis/game-report";
import type { Color } from "@/core/domain/game";
import type { GameAnalysisRecord } from "@/core/domain/game-analysis";
import { inPeriod, mostCommon, type Period, type StatGame } from "./statistics";

/** How the owner's own moves went, over a set of analysed games. */
export interface MoveAccuracy {
  games: number;
  /** Moves the engine judged, which is what every rate below is out of. */
  moves: number;
  /** Mean centipawn loss per move, weighted by moves rather than by game. */
  averageCentipawnLoss: number;
  inaccuracies: number;
  mistakes: number;
  blunders: number;
  missedMates: number;
  missedWins: number;
}

/**
 * Stretches of the game by move number.
 *
 * Roughly opening, early middlegame, late middlegame, the approach to the
 * endgame and the endgame — not by any definition of the phases, which would
 * need the position, but close enough to show where in a game errors gather.
 */
export const MOVE_BANDS = [
  { id: "1-10", label: "Moves 1–10", from: 1, to: 10 },
  { id: "11-20", label: "Moves 11–20", from: 11, to: 20 },
  { id: "21-30", label: "Moves 21–30", from: 21, to: 30 },
  { id: "31-40", label: "Moves 31–40", from: 31, to: 40 },
  { id: "41+", label: "Move 41 on", from: 41, to: Number.POSITIVE_INFINITY },
] as const;

export interface MoveBandRow {
  band: (typeof MOVE_BANDS)[number]["id"];
  label: string;
  /** The owner's moves played in this stretch, across the analysed games. */
  moves: number;
  mistakes: number;
  blunders: number;
  /** Mistakes and blunders per hundred moves, or null with no moves to count. */
  perHundredMoves: number | null;
}

export interface OpeningAccuracyRow {
  color: Color;
  eco: string | null;
  name: string | null;
  accuracy: MoveAccuracy;
}

export interface AccuracyStatistics {
  /** The owner's games in the period. */
  games: number;
  /** How many of them have been analysed — what every figure here rests on. */
  analysed: number;
  /** Null when nothing in the period has been analysed. */
  own: MoveAccuracy | null;
  byColor: Record<Color, MoveAccuracy | null>;
  byMoveNumber: MoveBandRow[];
  /** Most analysed first. */
  openings: OpeningAccuracyRow[];
}

interface Totals {
  games: number;
  moves: number;
  lossSum: number;
  inaccuracies: number;
  mistakes: number;
  blunders: number;
  missedMates: number;
  missedWins: number;
}

function totals(): Totals {
  return {
    games: 0,
    moves: 0,
    lossSum: 0,
    inaccuracies: 0,
    mistakes: 0,
    blunders: 0,
    missedMates: 0,
    missedWins: 0,
  };
}

function movesJudged(side: ColourSummary): number {
  return Object.values(side.counts).reduce((sum, count) => sum + count, 0);
}

function addSide(target: Totals, side: ColourSummary): void {
  const moves = movesJudged(side);

  target.games += 1;
  target.moves += moves;
  // Weighted by moves: a miniature and a ninety-move game should not count the
  // same towards an average taken over moves.
  target.lossSum += side.averageCentipawnLoss * moves;
  target.inaccuracies += side.counts.inaccuracy;
  target.mistakes += side.counts.mistake;
  target.blunders += side.counts.blunder;
  target.missedMates += side.missedMates;
  target.missedWins += side.missedWins;
}

function finish(source: Totals): MoveAccuracy | null {
  if (source.games === 0) return null;

  return {
    games: source.games,
    moves: source.moves,
    averageCentipawnLoss: source.moves === 0 ? 0 : source.lossSum / source.moves,
    inaccuracies: source.inaccuracies,
    mistakes: source.mistakes,
    blunders: source.blunders,
    missedMates: source.missedMates,
    missedWins: source.missedWins,
  };
}

/**
 * How many of a side's moves fall into a stretch of move numbers.
 *
 * White plays moves 1 to ⌈plies/2⌉ and Black 1 to ⌊plies/2⌋, so the count needs
 * nothing but the game's length and the side.
 */
function movesInBand(plies: number, color: Color, from: number, to: number): number {
  const last = color === "white" ? Math.ceil(plies / 2) : Math.floor(plies / 2);
  return Math.max(0, Math.min(last, to) - from + 1);
}

/**
 * The quality of the owner's own moves, from the per-game analysis records.
 *
 * Only the owner's side of each game counts: an opponent's blunder is not
 * something to work on. Games without a record are left out rather than
 * treated as flawless, and `analysed` says how many there were, so a figure
 * resting on five games out of a hundred is not read as the whole picture.
 */
export function buildAccuracy(
  games: Iterable<StatGame>,
  analyses: ReadonlyMap<number, GameAnalysisRecord>,
  period: Period = {},
): AccuracyStatistics {
  const bounded = period.from !== undefined || period.to !== undefined;

  let count = 0;
  const own = totals();
  const byColor: Record<Color, Totals> = { white: totals(), black: totals() };
  const bands = MOVE_BANDS.map(() => ({ moves: 0, mistakes: 0, blunders: 0 }));
  const openings = new Map<string, Totals>();
  const openingNames = new Map<string, Map<string, number>>();

  for (const game of games) {
    if (bounded && (game.dateIso === "" || !inPeriod(game.dateIso, period))) continue;
    count += 1;

    const record = analyses.get(game.id);
    if (!record) continue;

    const side = game.playerColor === "white" ? record.white : record.black;
    addSide(own, side);
    addSide(byColor[game.playerColor], side);

    const key = `${game.playerColor}|${game.eco ?? ""}`;
    let opening = openings.get(key);
    if (!opening) {
      opening = totals();
      openings.set(key, opening);
    }
    addSide(opening, side);
    if (game.opening) {
      const names = openingNames.get(key) ?? new Map<string, number>();
      names.set(game.opening, (names.get(game.opening) ?? 0) + 1);
      openingNames.set(key, names);
    }

    MOVE_BANDS.forEach((band, index) => {
      bands[index].moves += movesInBand(record.plies, game.playerColor, band.from, band.to);
    });

    // Odd plies are White's moves.
    const ownParity = game.playerColor === "white" ? 1 : 0;
    for (const error of record.errors) {
      if (error.ply % 2 !== ownParity || error.quality === "inaccuracy") continue;

      const moveNumber = Math.ceil(error.ply / 2);
      const index = MOVE_BANDS.findIndex((band) => moveNumber >= band.from && moveNumber <= band.to);
      if (error.quality === "blunder") bands[index].blunders += 1;
      else bands[index].mistakes += 1;
    }
  }

  return {
    games: count,
    analysed: own.games,
    own: finish(own),
    byColor: { white: finish(byColor.white), black: finish(byColor.black) },
    byMoveNumber: MOVE_BANDS.map((band, index) => ({
      band: band.id,
      label: band.label,
      ...bands[index],
      perHundredMoves:
        bands[index].moves === 0
          ? null
          : ((bands[index].mistakes + bands[index].blunders) / bands[index].moves) * 100,
    })),
    openings: [...openings.entries()]
      .map(([key, value]) => {
        const [color, eco] = key.split("|") as [Color, string];
        return {
          color,
          eco: eco === "" ? null : eco,
          name: mostCommon(openingNames.get(key) ?? new Map()),
          accuracy: finish(value)!,
        };
      })
      .sort(
        (a, b) =>
          b.accuracy.games - a.accuracy.games || (a.eco ?? "~").localeCompare(b.eco ?? "~"),
      ),
  };
}
