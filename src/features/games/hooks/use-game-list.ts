"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import type { GameRecord } from "@/core/domain/game";
import {
  getGamesByIds,
  queryGameIds,
  type GameFilter,
  type GameSort,
} from "@/persistence/repositories/game-query";

export interface GameListWindow {
  /** Every matching id, in display order. Drives the scrollbar. */
  ids: number[];
  /** Records for the currently visible rows, keyed by id. */
  loaded: Map<number, GameRecord>;
  /** True until the first query resolves, so the list can show placeholders. */
  loading: boolean;
}

/**
 * Data source for the virtualised game list.
 *
 * Loading is split in two deliberately. The full ordered id list is needed to
 * size the scroll area and map a scroll offset to a row, but it is only
 * numbers, so it stays cheap even for a very large collection. Records are
 * fetched for the visible window alone, which keeps memory flat no matter how
 * far the user scrolls.
 *
 * Both halves go through `useLiveQuery`, so an import or a deletion is
 * reflected without any manual invalidation.
 */
export function useGameList(
  filter: GameFilter,
  sort: GameSort,
  visibleIndexes: readonly number[],
): GameListWindow {
  // The filter object is rebuilt on every render of the caller, so it is
  // serialised for the dependency list. Without this the query would re-run on
  // every keystroke elsewhere in the page.
  const filterKey = JSON.stringify(filter);

  const ids = useLiveQuery(() => queryGameIds(filter, sort), [filterKey, sort]);

  const windowIds = useMemo(() => {
    if (!ids) return [];

    return visibleIndexes
      .map((index) => ids[index])
      .filter((id): id is number => id !== undefined);
  }, [ids, visibleIndexes]);

  const windowKey = windowIds.join(",");

  const records = useLiveQuery(() => getGamesByIds(windowIds), [windowKey]);

  const loaded = useMemo(() => {
    const map = new Map<number, GameRecord>();
    for (const record of records ?? []) map.set(record.id as number, record);
    return map;
  }, [records]);

  return { ids: ids ?? [], loaded, loading: ids === undefined };
}
