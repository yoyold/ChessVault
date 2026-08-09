"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  distinctTags,
  distinctValues,
  type GameFilter,
  type GameSort,
} from "@/persistence/repositories/game-query";

interface GameFiltersProps {
  filter: GameFilter;
  sort: GameSort;
  onFilterChange: (filter: GameFilter) => void;
  onSortChange: (sort: GameSort) => void;
  resultCount: number;
}

/**
 * Controls fill their grid cell on a phone and size to their content above it.
 *
 * Wrapping a row of differently sized controls works while several fit on a
 * line: the row's own edges keep it tidy. One control per line, each a
 * different width, has no edges to keep — which is what made the filters read
 * as scattered rather than as a set.
 */
const SELECT_CLASS =
  "border-input bg-background h-9 w-full min-w-0 rounded-md border px-2 text-sm sm:w-auto";

/** A label and its control. `min-w-0` is what lets the control shrink to fit. */
const FIELD_CLASS =
  "text-muted-foreground flex min-w-0 items-center gap-1 text-sm";

/** Options are read from the data, so only values actually present are offered. */
function useFilterOptions() {
  return useLiveQuery(async () => {
    const [ecos, events, tags] = await Promise.all([
      distinctValues("eco"),
      distinctValues("event"),
      distinctTags(),
    ]);
    return { ecos, events, tags };
  });
}

export function GameFilters({
  filter,
  sort,
  onFilterChange,
  onSortChange,
  resultCount,
}: GameFiltersProps) {
  const options = useFilterOptions();

  const update = (patch: Partial<GameFilter>) => {
    const next = { ...filter, ...patch };

    // Empty strings are dropped rather than stored: the query treats any
    // present key as an active filter. NaN is dropped too — a number input
    // yields it mid-edit, and it would match nothing at all.
    for (const key of Object.keys(next) as (keyof GameFilter)[]) {
      const value = next[key];
      if (value === "" || value === undefined || Number.isNaN(value)) delete next[key];
    }

    onFilterChange(next);
  };

  const active = Object.keys(filter).length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
        {/*
          Players only. Tournament and opening have their own controls, and
          including them here meant a player search also matched games where the
          name appeared in a tournament title.
        */}
        <Input
          value={filter.text ?? ""}
          onChange={(event) => update({ text: event.target.value })}
          placeholder="Search players…"
          aria-label="Search players"
          className="col-span-2 sm:max-w-xs"
        />

        <Input
          value={filter.opponent ?? ""}
          onChange={(event) => update({ opponent: event.target.value })}
          placeholder="Opponent"
          aria-label="Filter by opponent"
          className="col-span-2 sm:max-w-40"
        />

        <select
          className={SELECT_CLASS}
          value={filter.colour ?? ""}
          aria-label="Filter by colour"
          onChange={(event) =>
            update({ colour: (event.target.value || undefined) as GameFilter["colour"] })
          }
        >
          <option value="">Any colour</option>
          <option value="white">I had White</option>
          <option value="black">I had Black</option>
        </select>

        <select
          className={SELECT_CLASS}
          value={filter.result ?? ""}
          aria-label="Filter by result"
          onChange={(event) =>
            update({ result: (event.target.value || undefined) as GameFilter["result"] })
          }
        >
          <option value="">Any result</option>
          <option value="1-0">White won</option>
          <option value="0-1">Black won</option>
          <option value="1/2-1/2">Draw</option>
          <option value="*">Unfinished</option>
        </select>

        <select
          className={SELECT_CLASS}
          value={filter.eco ?? ""}
          aria-label="Filter by ECO code"
          onChange={(event) => update({ eco: event.target.value })}
        >
          <option value="">Any ECO</option>
          {options?.ecos.map((eco) => (
            <option key={eco} value={eco}>
              {eco}
            </option>
          ))}
        </select>

        <select
          className={SELECT_CLASS}
          value={filter.event ?? ""}
          aria-label="Filter by event"
          onChange={(event) => update({ event: event.target.value })}
        >
          <option value="">Any event</option>
          {options?.events.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        {options && options.tags.length > 0 ? (
          <select
            className={SELECT_CLASS}
            value={filter.tag ?? ""}
            aria-label="Filter by tag"
            onChange={(event) => update({ tag: event.target.value })}
          >
            <option value="">Any tag</option>
            {options.tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        ) : null}

        <label className={FIELD_CLASS}>
          From
          <Input
            type="date"
            value={filter.dateFrom ?? ""}
            onChange={(event) => update({ dateFrom: event.target.value })}
            aria-label="Earliest date"
            className="min-w-0 flex-1 sm:w-36 sm:flex-none"
          />
        </label>

        <label className={FIELD_CLASS}>
          To
          <Input
            type="date"
            value={filter.dateTo ?? ""}
            onChange={(event) => update({ dateTo: event.target.value })}
            aria-label="Latest date"
            className="min-w-0 flex-1 sm:w-36 sm:flex-none"
          />
        </label>

        {/*
          Opponent rating, from your own point of view: whichever side you did
          not play. Games where you are not a player, or where the rating is
          absent, cannot satisfy a range and are excluded.
        */}
        <label className={cn(FIELD_CLASS, "col-span-2 sm:col-span-1")}>
          Opp. rating
          <Input
            type="number"
            inputMode="numeric"
            value={filter.opponentEloFrom ?? ""}
            onChange={(event) =>
              update({
                opponentEloFrom: event.target.value === "" ? undefined : Number(event.target.value),
              })
            }
            placeholder="from"
            aria-label="Minimum opponent rating"
            className="min-w-0 flex-1 sm:w-24 sm:flex-none"
          />
          <Input
            type="number"
            inputMode="numeric"
            value={filter.opponentEloTo ?? ""}
            onChange={(event) =>
              update({
                opponentEloTo: event.target.value === "" ? undefined : Number(event.target.value),
              })
            }
            placeholder="to"
            aria-label="Maximum opponent rating"
            className="min-w-0 flex-1 sm:w-24 sm:flex-none"
          />
        </label>

        {active ? (
          <Button
            variant="ghost"
            size="sm"
            className="col-span-2 gap-1 sm:col-span-1"
            onClick={() => onFilterChange({})}
          >
            <X className="size-3.5" />
            Clear
          </Button>
        ) : null}
      </div>

      <div className="text-muted-foreground flex items-center gap-3 text-sm">
        <span className="tabular-nums">
          {resultCount.toLocaleString()} game{resultCount === 1 ? "" : "s"}
        </span>

        <span className={cn("ml-auto flex items-center gap-2")}>
          Sort
          <select
            className={SELECT_CLASS}
            value={sort}
            aria-label="Sort order"
            onChange={(event) => onSortChange(event.target.value as GameSort)}
          >
            <option value="date">By date played</option>
            <option value="imported">By date imported</option>
            <option value="opponentElo">By opponent rating</option>
            <option value="event">By tournament</option>
          </select>
        </span>
      </div>
    </div>
  );
}
