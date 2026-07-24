"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Trash2 } from "lucide-react";
import type { GameRecord } from "@/core/domain/game";
import { ResultBadge } from "@/components/result-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 56;

interface GameListProps {
  /** Every matching id in display order; only the visible window is loaded. */
  ids: number[];
  loaded: Map<number, GameRecord>;
  loading: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** Opening a game outright, rather than just selecting it. */
  onOpen: (id: number) => void;
  /** Asks the parent to confirm deleting a game, without opening it. */
  onRequestDelete: (id: number) => void;
  /** Reports which rows are on screen so their records can be fetched. */
  onVisibleRangeChange: (indexes: number[]) => void;
}

/**
 * Virtualised list of games.
 *
 * Only the rows on screen exist in the DOM and only their records are loaded,
 * so the list behaves the same with fifty games or fifty thousand.
 *
 * The query itself lives in the parent. Owning it here would mean reporting the
 * result count upwards during render, which is a state update in another
 * component mid-render — React does not allow that, and it deadlocked the
 * surrounding Suspense boundary rather than failing visibly.
 */
export function GameList({
  ids,
  loaded,
  loading,
  selectedId,
  onSelect,
  onOpen,
  onRequestDelete,
  onVisibleRangeChange,
}: GameListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: ids.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    // Render a little beyond the viewport so scrolling does not expose
    // unloaded rows before their data arrives.
    overscan: 8,
    // Fired from a scroll event, not during render, so updating state here is
    // safe. The parent de-duplicates before issuing a query.
    onChange: (instance) =>
      onVisibleRangeChange(instance.getVirtualItems().map((item) => item.index)),
  });

  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-1">
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton key={index} className="h-12" />
        ))}
      </div>
    );
  }

  if (ids.length === 0) {
    return (
      <p className="text-muted-foreground p-8 text-center text-sm">
        No games match these filters.
      </p>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const id = ids[item.index];
          const game = loaded.get(id);

          return (
            <div
              key={id}
              className="absolute top-0 left-0 w-full px-1"
              style={{ height: item.size, transform: `translateY(${item.start}px)` }}
            >
              {game ? (
                <GameRow
                  game={game}
                  selected={id === selectedId}
                  onSelect={() => onSelect(id)}
                  onOpen={() => onOpen(id)}
                  onDelete={() => onRequestDelete(id)}
                />
              ) : (
                // The row exists in the ordered id list but its record has not
                // arrived yet. Reserving the space keeps the scrollbar steady.
                <Skeleton className="h-12" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GameRow({
  game,
  selected,
  onSelect,
  onOpen,
  onDelete,
}: {
  game: GameRecord;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    // A container, not a button: the delete control is a sibling button, and a
    // button cannot be nested inside another. `group` lets the delete control
    // reveal on hover; it also appears on keyboard focus within the row.
    <div
      className={cn(
        // Rows stay neutral: the result is carried by its badge alone, so the
        // selection remains the only thing that changes a row's background.
        "group flex h-12 w-full items-center rounded-md transition-colors",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={onOpen}
        aria-current={selected ? "true" : undefined}
        className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-md px-3 text-left text-sm"
      >
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium">{game.white || "?"}</span>
          {game.whiteElo ? (
            <span className="text-muted-foreground text-xs"> {game.whiteElo}</span>
          ) : null}
          <span className="text-muted-foreground"> vs </span>
          <span className="font-medium">{game.black || "?"}</span>
          {game.blackElo ? (
            <span className="text-muted-foreground text-xs"> {game.blackElo}</span>
          ) : null}
        </span>

        <span className="flex w-16 shrink-0 justify-center">
          <ResultBadge result={game.result} playerColor={game.playerColor} />
        </span>

        <span className="text-muted-foreground hidden w-32 shrink-0 truncate lg:block">
          {game.event ?? ""}
        </span>

        <span className="text-muted-foreground hidden w-24 shrink-0 truncate sm:block">
          {game.eco ?? ""}
          {game.eco && game.opening ? " " : ""}
          {game.opening ?? ""}
        </span>

        <span className="text-muted-foreground w-24 shrink-0 text-right tabular-nums">
          {/* Undated games store an empty string; showing a dash is clearer than a blank cell. */}
          {game.dateIso === "" ? "—" : game.dateIso}
        </span>
      </button>

      {/*
        Deleting from the row exists precisely so a game whose detail view would
        hang — a corrupted, oversized game — can still be removed without opening
        it. Reserved as a fixed slot so the layout never shifts; the icon fades
        in on hover or keyboard focus.
      */}
      <button
        type="button"
        aria-label={`Delete game ${game.white || "?"} versus ${game.black || "?"}`}
        onClick={onDelete}
        className="text-muted-foreground hover:text-destructive flex h-full w-9 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
