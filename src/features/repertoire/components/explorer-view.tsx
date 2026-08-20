"use client";

import { Chess } from "chess.js";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, SkipBack } from "lucide-react";
import { positionKey } from "@/core/chess/position-key";
import { formatMoveNumber, formatSanLine } from "@/core/chess/pgn/game-timeline";
import type { Color, GameRecord } from "@/core/domain/game";
import type { ExplorerMove, OutcomeTally } from "@/core/openings/explorer";
import { ResultBadge } from "@/components/result-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AnalysisBoard } from "@/features/analysis/components/analysis-board";
import { useShortcut } from "@/features/shell/use-shortcut";
import {
  EXPLORER_GAME_LIMIT,
  getExplorerPosition,
} from "@/persistence/repositories/opening-explorer";
import { cn } from "@/lib/utils";

/** Which of the collection's games the numbers are drawn from. */
type Scope = "all" | "white" | "black";

const SCOPE_LABEL: Record<Scope, string> = {
  all: "All games",
  white: "Games I had White",
  black: "Games I had Black",
};

const SELECT_CLASS = "border-input bg-background h-9 rounded-md border px-2 text-sm";

/** Replay a line of SAN from the start and describe where it lands. */
function replay(line: readonly string[]) {
  const board = new Chess();
  let lastUci: string | null = null;

  for (const san of line) {
    lastUci = board.move(san).lan;
  }

  return { fen: board.fen(), key: positionKey(board), lastUci };
}

/**
 * The collection as an opening book.
 *
 * Every other view starts from a game and follows it forwards. This one starts
 * from a position and asks what the whole collection did there — which move was
 * chosen how often, how each one turned out, and which games those were. It is
 * the question an opening database answers, asked of one player's own games,
 * where the answer is worth far more: a line scoring 30% across a hundred of
 * your games is a hole in your preparation, and nothing in a game-by-game view
 * can show it.
 *
 * The record is the owner's own, not White's. These are their games, so "how do
 * I score here" is the question, and it means the same thing whichever side
 * they had.
 */
export function ExplorerView({ color }: { color: Color }) {
  const [line, setLine] = useState<string[]>([]);
  const [scope, setScope] = useState<Scope>("all");

  const { fen, key, lastUci } = useMemo(() => replay(line), [line]);

  const position = useLiveQuery(
    () => getExplorerPosition(key, { color: scope === "all" ? undefined : scope }),
    [key, scope],
  );

  useShortcut("ArrowLeft", () => setLine((current) => current.slice(0, -1)));
  useShortcut("ArrowUp", () => setLine([]));

  /**
   * Play a move on the board.
   *
   * Nothing is written: this view only reads the collection. A move no game has
   * played is still allowed, because landing on an empty position is a real
   * answer — it says the line has never been played — and the way back is a
   * single keystroke.
   */
  function playMove(from: string, to: string): boolean {
    const board = new Chess(fen);

    let san: string;
    try {
      san = board.move({ from, to, promotion: "q" }).san;
    } catch {
      return false;
    }

    setLine((current) => [...current, san]);
    return true;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex w-full max-w-[min(100%,calc(100svh-16rem))] min-w-0 flex-col gap-3">
        <AnalysisBoard
          fen={fen}
          orientation={color}
          lastMoveUci={lastUci}
          onMove={playMove}
        />

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Back to start"
            disabled={line.length === 0}
            onClick={() => setLine([])}
          >
            <SkipBack />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous move"
            disabled={line.length === 0}
            onClick={() => setLine((current) => current.slice(0, -1))}
          >
            <ChevronLeft />
          </Button>

          <span className="text-muted-foreground ml-2 truncate text-sm">
            {line.length === 0 ? "Starting position" : formatSanLine(line)}
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-muted-foreground flex items-center gap-1 text-sm">
            Drawn from
            <select
              className={SELECT_CLASS}
              value={scope}
              aria-label="Which games to count"
              onChange={(event) => setScope(event.target.value as Scope)}
            >
              {(["all", "white", "black"] as const).map((option) => (
                <option key={option} value={option}>
                  {SCOPE_LABEL[option]}
                </option>
              ))}
            </select>
          </label>

          {position ? (
            <span className="text-muted-foreground ml-auto text-sm tabular-nums">
              {position.stats.games === 1
                ? "1 game here"
                : `${position.stats.games} games here`}
            </span>
          ) : null}
        </div>

        {!position ? (
          <Skeleton className="h-64 rounded-lg" />
        ) : position.stats.games === 0 ? (
          <p className="text-muted-foreground rounded-md border p-4 text-sm">
            {line.length === 0
              ? "No games in the collection yet. Import some, and every position they reach appears here."
              : "None of your games reached this position. Step back to the last one that was played."}
          </p>
        ) : (
          <>
            <MoveTable
              moves={position.stats.moves}
              ply={line.length + 1}
              ended={position.stats.ended}
              total={position.stats.games}
              onPlay={(san) => setLine((current) => [...current, san])}
            />

            <GameList
              games={position.games}
              total={position.stats.games}
              tally={position.stats}
            />
          </>
        )}
      </div>
    </div>
  );
}

function MoveTable({
  moves,
  ply,
  ended,
  total,
  onPlay,
}: {
  moves: readonly ExplorerMove[];
  ply: number;
  ended: number;
  total: number;
  onPlay: (san: string) => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">
        Played from here
        <span className="text-muted-foreground ml-2 text-xs font-normal">
          how often each move was chosen, and how it turned out
        </span>
      </h2>

      <ul className="flex flex-col gap-0.5">
        {moves.map((move) => (
          <li key={move.san}>
            <button
              type="button"
              onClick={() => onPlay(move.san)}
              className="hover:bg-accent flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm"
            >
              <span className="w-24 shrink-0 truncate font-medium">
                {formatMoveNumber(ply)} {move.san}
              </span>

              <span className="text-muted-foreground w-20 shrink-0 text-right tabular-nums">
                {move.games}×
                <span className="ml-1 hidden text-xs sm:inline">
                  {Math.round(move.share * 100)}%
                </span>
              </span>

              <OutcomeBar tally={move} className="min-w-0 flex-1" />

              <ScorePercent tally={move} />
            </button>
          </li>
        ))}
      </ul>

      {ended > 0 ? (
        <p className="text-muted-foreground text-xs">
          {ended === 1 ? "One game ended here" : `${ended} games ended here`}
          {ended === total ? "" : ", with no move to follow"}.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Wins, draws and losses as one bar.
 *
 * Proportions of the *decided* games, not of every game: an unfinished game, or
 * one the owner was not in, has no result to show, and stretching the bar over
 * it would quietly turn missing information into a fourth outcome. How many
 * games the bar rests on is on its tooltip.
 */
function OutcomeBar({ tally, className }: { tally: OutcomeTally; className?: string }) {
  if (tally.scored === 0) {
    return (
      <span className={cn("text-muted-foreground truncate text-xs", className)}>
        no finished games
      </span>
    );
  }

  const segments = [
    { key: "win", count: tally.wins, style: "bg-result-win", label: "won" },
    { key: "draw", count: tally.draws, style: "bg-result-draw", label: "drawn" },
    { key: "loss", count: tally.losses, style: "bg-result-loss", label: "lost" },
  ].filter((segment) => segment.count > 0);

  const description = segments
    .map((segment) => `${segment.count} ${segment.label}`)
    .join(" · ");

  return (
    <span
      role="img"
      aria-label={description}
      title={description}
      className={cn("bg-muted flex h-3.5 overflow-hidden rounded-sm", className)}
    >
      {segments.map((segment) => (
        <span
          key={segment.key}
          className={segment.style}
          style={{ width: `${(segment.count / tally.scored) * 100}%` }}
        />
      ))}
    </span>
  );
}

/**
 * The record as a single number: percentage of the available points.
 *
 * A line never decided shows a dash rather than a fabricated 50%, the same way
 * the extraction list does.
 */
function ScorePercent({ tally }: { tally: OutcomeTally }) {
  return (
    <span
      className={cn(
        "w-12 shrink-0 text-right tabular-nums",
        tally.scored === 0
          ? "text-muted-foreground"
          : tally.score >= 0.55
            ? "text-result-win"
            : tally.score <= 0.45
              ? "text-result-loss"
              : "text-muted-foreground",
      )}
      title={
        tally.scored === 0
          ? "No finished games yet"
          : `${tally.scored} finished game${tally.scored === 1 ? "" : "s"}`
      }
    >
      {tally.scored === 0 ? "—" : `${Math.round(tally.score * 100)}%`}
    </span>
  );
}

function GameList({
  games,
  total,
  tally,
}: {
  games: readonly GameRecord[];
  total: number;
  tally: OutcomeTally;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium">Games that reached this position</h2>
        <OutcomeBar tally={tally} className="min-w-24 flex-1" />
        <ScorePercent tally={tally} />
      </div>

      <ul className="flex flex-col gap-0.5">
        {games.map((game) => (
          <li key={game.id}>
            <Link
              href={`/analysis/?game=${game.id}`}
              className="hover:bg-accent flex items-center gap-3 rounded-md px-2 py-1.5 text-sm"
            >
              <ResultBadge
                result={game.result}
                playerColor={game.playerColor}
                className="w-14 shrink-0"
              />

              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{game.white || "?"}</span>
                <span className="text-muted-foreground"> vs </span>
                <span className="font-medium">{game.black || "?"}</span>
              </span>

              <span className="text-muted-foreground hidden w-32 shrink-0 truncate lg:block">
                {game.event ?? ""}
              </span>

              <span className="text-muted-foreground w-24 shrink-0 text-right tabular-nums">
                {/* Undated games store an empty string; a dash reads better than a gap. */}
                {game.dateIso === "" ? "—" : game.dateIso}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {total > games.length ? (
        <p className="text-muted-foreground text-xs">
          Showing the {EXPLORER_GAME_LIMIT} most recent of {total}. Play a move to
          narrow it.
        </p>
      ) : null}
    </section>
  );
}
