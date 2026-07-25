"use client";

import { Chess } from "chess.js";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { ChevronLeft, SkipBack, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { positionKey, type PositionKey } from "@/core/chess/position-key";
import { formatMoveNumber } from "@/core/chess/pgn/game-timeline";
import type { Color } from "@/core/domain/game";
import {
  isOwnerToMove,
  REPERTOIRE_ROOT,
  type RepertoireMove,
} from "@/core/domain/repertoire";
import {
  buildRepertoireGraph,
  findGaps,
  repertoireStats,
  shortestLineTo,
} from "@/core/repertoire/repertoire-graph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AnalysisBoard } from "@/features/analysis/components/analysis-board";
import { useShortcut } from "@/features/shell/use-shortcut";
import {
  addRepertoireMove,
  deleteRepertoireMove,
  getContinuations,
  getRepertoire,
  getRepertoireMove,
  updateRepertoireMove,
} from "@/persistence/repositories/repertoire-repository";
import { cn } from "@/lib/utils";

/** Replay a line of SAN from the start and describe where it lands. */
function replay(line: readonly string[]) {
  const board = new Chess();
  let previousKey: PositionKey | null = null;
  let lastUci: string | null = null;

  for (const san of line) {
    previousKey = positionKey(board);
    lastUci = board.move(san).lan;
  }

  return {
    fen: board.fen(),
    currentKey: positionKey(board),
    sideToMove: board.turn(),
    previousKey,
    lastUci,
    lastSan: line.at(-1) ?? null,
  };
}

/**
 * Stable empty result for queries that have not resolved yet.
 *
 * A fresh `[]` on each render would change the identity every time and defeat
 * the memoised graph below, rebuilding it on every keystroke.
 */
const NO_MOVES: RepertoireMove[] = [];

/** Render a line of SAN with move numbers, as it would be written down. */
function formatLine(line: readonly string[]): string {
  return line
    .map((san, index) =>
      index % 2 === 0 ? `${formatMoveNumber(index + 1)} ${san}` : san,
    )
    .join(" ");
}

export function RepertoireView() {
  const [color, setColor] = useState<Color>("white");
  const [line, setLine] = useState<string[]>([]);

  const { fen, currentKey, sideToMove, previousKey, lastUci, lastSan } = useMemo(
    () => replay(line),
    [line],
  );

  const continuations =
    useLiveQuery(() => getContinuations(color, currentKey), [color, currentKey]) ??
    NO_MOVES;

  const allMoves = useLiveQuery(() => getRepertoire(color), [color]) ?? NO_MOVES;

  const currentMove = useLiveQuery(
    () =>
      previousKey && lastSan
        ? getRepertoireMove(color, previousKey, lastSan)
        : Promise.resolve(undefined),
    [color, previousKey, lastSan],
  );

  const graph = useMemo(() => buildRepertoireGraph(allMoves), [allMoves]);
  const stats = useMemo(
    () => repertoireStats(allMoves, REPERTOIRE_ROOT, color),
    [allMoves, color],
  );
  const gaps = useMemo(() => findGaps(graph, REPERTOIRE_ROOT, color), [graph, color]);

  // Whose decision a position represents is the central idea of a repertoire:
  // the owner's own choice, or a reply that must be prepared for.
  const ownerToMove = isOwnerToMove(color, sideToMove);

  useShortcut("ArrowLeft", () => setLine((current) => current.slice(0, -1)));
  useShortcut("ArrowUp", () => setLine([]));

  function switchColor(next: Color) {
    setColor(next);
    // A line is a path through one repertoire; carrying it across would show
    // moves the other repertoire has never prepared.
    setLine([]);
  }

  /**
   * Play a move on the board, adding it to the repertoire.
   *
   * The board needs its answer synchronously — it either accepts the drop or
   * snaps the piece back — so legality is decided here and the write is left to
   * run behind it. Once the move is known to be legal the only remaining
   * failure is the database itself, which is reported rather than pretended
   * away.
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

    void addRepertoireMove({ color, fromFen: fen, san }).catch((error: unknown) => {
      toast.error("Could not save that move", {
        description: error instanceof Error ? error.message : undefined,
      });
    });

    return true;
  }

  async function removeMove(san: string) {
    const result = await deleteRepertoireMove(color, currentKey, san);

    toast.success(
      result.removed === 1
        ? "Move removed"
        : `Move removed, with ${result.removed - 1} that only it reached`,
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex w-full max-w-[min(100%,calc(100svh-16rem))] min-w-0 flex-col gap-3">
        <div className="flex items-center gap-2">
          <ColorToggle color={color} onChange={switchColor} />

          <span className="text-muted-foreground ml-auto text-sm tabular-nums">
            {stats.moveCount} moves · depth {stats.maxDepth} · {stats.gapCount} gaps
          </span>
        </div>

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
            {line.length === 0 ? "Starting position" : formatLine(line)}
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-sm font-medium">
              {ownerToMove ? "What you play here" : "Replies to be ready for"}
            </h2>
            <span className="text-muted-foreground text-xs">
              {ownerToMove
                ? "Your own choice — the first is the main line."
                : "What the opponent may do; prepare an answer to each."}
            </span>
          </div>

          {continuations.length === 0 ? (
            <p
              className={cn(
                "rounded-md border p-3 text-sm",
                ownerToMove
                  ? "border-destructive/40 bg-destructive/5"
                  : "text-muted-foreground",
              )}
            >
              {ownerToMove
                ? "Nothing prepared here, and it is your move. Play one on the board to add it."
                : "No replies prepared. Play one on the board to add it."}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {continuations.map((move, index) => (
                <li key={move.san} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLine((current) => [...current, move.san])}
                    className="hover:bg-accent flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
                  >
                    <span className="font-medium">
                      {formatMoveNumber(line.length + 1)} {move.san}
                    </span>
                    {index === 0 && ownerToMove && continuations.length > 1 ? (
                      <Badge variant="secondary" className="text-xs">
                        main
                      </Badge>
                    ) : null}
                    {move.note ? (
                      <span className="text-muted-foreground truncate text-xs italic">
                        {move.note}
                      </span>
                    ) : null}
                  </button>

                  {index > 0 ? (
                    <button
                      type="button"
                      aria-label={`Make ${move.san} the main line`}
                      title="Make this the main line"
                      onClick={() =>
                        void updateRepertoireMove(color, currentKey, move.san, {
                          priority: continuations[0].priority + 1,
                        })
                      }
                      className="text-muted-foreground hover:text-foreground rounded p-1"
                    >
                      <Star className="size-3.5" />
                    </button>
                  ) : null}

                  <button
                    type="button"
                    aria-label={`Remove ${move.san}`}
                    onClick={() => void removeMove(move.san)}
                    className="text-muted-foreground hover:text-destructive rounded p-1"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {currentMove && previousKey ? (
          <NoteEditor
            // Keyed by move so stepping elsewhere remounts with that move's
            // note rather than carrying the previous draft across.
            key={`${color}-${previousKey}-${currentMove.san}`}
            san={currentMove.san}
            ply={line.length}
            note={currentMove.note}
            onSave={(note) =>
              void updateRepertoireMove(color, previousKey, currentMove.san, { note })
            }
          />
        ) : null}

        <GapList
          gaps={gaps}
          onGoTo={(key) => {
            const target = shortestLineTo(graph, REPERTOIRE_ROOT, key);
            if (target) setLine(target);
          }}
          describe={(key) => {
            const target = shortestLineTo(graph, REPERTOIRE_ROOT, key);
            return target && target.length > 0 ? formatLine(target) : "Starting position";
          }}
        />
      </div>
    </div>
  );
}

function ColorToggle({
  color,
  onChange,
}: {
  color: Color;
  onChange: (color: Color) => void;
}) {
  return (
    <div className="flex rounded-md border p-0.5">
      {(["white", "black"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={color === option}
          onClick={() => onChange(option)}
          className={cn(
            "rounded px-3 py-1 text-sm capitalize transition-colors",
            color === option ? "bg-primary text-primary-foreground" : "hover:bg-accent",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function NoteEditor({
  san,
  ply,
  note,
  onSave,
}: {
  san: string;
  ply: number;
  note: string;
  onSave: (note: string) => void;
}) {
  const [draft, setDraft] = useState(note);

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        Note on {formatMoveNumber(ply)} {san}
      </h3>
      <Textarea
        value={draft}
        // Saved on every keystroke, as in the analysis annotation editor: a
        // blur is not guaranteed to happen before the user navigates away.
        onChange={(event) => {
          setDraft(event.target.value);
          onSave(event.target.value);
        }}
        placeholder="Why this move, what to watch for…"
        aria-label="Note on this move"
        rows={3}
      />
    </section>
  );
}

function GapList({
  gaps,
  onGoTo,
  describe,
}: {
  gaps: PositionKey[];
  onGoTo: (key: PositionKey) => void;
  describe: (key: PositionKey) => string;
}) {
  if (gaps.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No gaps: every position you reach has a move prepared.
      </p>
    );
  }

  // Capped: a wide repertoire can have hundreds of open ends, and a list that
  // long stops being a to-do and becomes wallpaper. Shallowest come first.
  const shown = gaps.slice(0, 8);

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        Gaps ({gaps.length})
        <span className="text-muted-foreground ml-2 text-xs font-normal">
          positions you reach where it is your move and nothing is prepared
        </span>
      </h3>

      <ul className="flex flex-col gap-1">
        {shown.map((key) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => onGoTo(key)}
              className="hover:bg-accent w-full truncate rounded-md px-2 py-1.5 text-left text-sm"
            >
              {describe(key)}
            </button>
          </li>
        ))}
      </ul>

      {gaps.length > shown.length ? (
        <p className="text-muted-foreground text-xs">
          and {gaps.length - shown.length} more
        </p>
      ) : null}
    </section>
  );
}
