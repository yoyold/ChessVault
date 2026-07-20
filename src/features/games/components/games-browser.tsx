"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { GameDetail } from "./game-detail";
import { GameFilters } from "./game-filters";
import { GameList } from "./game-list";
import { useGameList } from "../hooks/use-game-list";
import type { GameFilter, GameSort } from "@/persistence/repositories/game-query";

/**
 * The game database browser: filters, list and detail panel.
 *
 * The selected game lives in a search parameter rather than a path segment.
 * Static export pre-renders every route at build time, and game ids exist only
 * in the user's browser, so a dynamic segment cannot be generated. A search
 * parameter keeps the selection deep-linkable and the back button correct
 * without needing a route per game. See ADR 0001.
 */
export function GamesBrowser() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filter, setFilter] = useState<GameFilter>({});
  const [sort, setSort] = useState<GameSort>("date");
  const [visibleIndexes, setVisibleIndexes] = useState<number[]>([]);

  // The query lives here rather than inside the list so the result count is
  // available to the filter bar without the list pushing state upwards mid-render.
  const { ids, loaded, loading } = useGameList(filter, sort, visibleIndexes);

  const handleVisibleRangeChange = useCallback((next: number[]) => {
    // The virtualiser reports on every scroll frame, and each distinct window
    // triggers a database read. Only a genuinely different range is stored.
    setVisibleIndexes((previous) =>
      previous.length === next.length &&
      previous[0] === next[0] &&
      previous[previous.length - 1] === next[next.length - 1]
        ? previous
        : next,
    );
  }, []);

  const rawId = searchParams.get("id");
  const parsedId = rawId === null ? Number.NaN : Number(rawId);
  const selectedId = Number.isInteger(parsedId) ? parsedId : null;

  const select = (id: number | null) => {
    // `replace` rather than `push`: clicking through a list of games should not
    // bury the page the user came from under one history entry per game.
    router.replace(id === null ? "/games/" : `/games/?id=${id}`, { scroll: false });
  };

  return (
    <div className="flex h-[calc(100svh-7rem)] flex-col gap-4">
      <GameFilters
        filter={filter}
        sort={sort}
        onFilterChange={setFilter}
        onSortChange={setSort}
        resultCount={ids.length}
      />

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-h-0 rounded-lg border">
          <GameList
            ids={ids}
            loaded={loaded}
            loading={loading}
            selectedId={selectedId}
            onSelect={select}
            onVisibleRangeChange={handleVisibleRangeChange}
          />
        </div>

        {selectedId !== null ? (
          <aside className="min-h-0 rounded-lg border p-4">
            <GameDetail
              gameId={selectedId}
              onClose={() => select(null)}
              onDeleted={() => select(null)}
            />
          </aside>
        ) : (
          <aside className="text-muted-foreground hidden items-center justify-center rounded-lg border p-4 text-sm lg:flex">
            Select a game to see its details.
          </aside>
        )}
      </div>
    </div>
  );
}
