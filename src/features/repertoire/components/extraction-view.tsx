"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatSanLine } from "@/core/chess/pgn/game-timeline";
import type { Color } from "@/core/domain/game";
import { REPERTOIRE_ROOT } from "@/core/domain/repertoire";
import {
  buildRepertoireGraph,
  shortestLineTo,
} from "@/core/repertoire/repertoire-graph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  adoptCandidates,
  extractRepertoireCandidates,
  type CandidateWithStatus,
} from "@/persistence/repositories/repertoire-extraction";
import { cn } from "@/lib/utils";

type SortBy = "depth" | "played" | "score";

const SELECT_CLASS = "border-input bg-background h-9 rounded-md border px-2 text-sm";

/**
 * Lines the owner has actually played, offered for the repertoire.
 *
 * Extraction answers what no single game can: not what was played once, but
 * what is played repeatedly and how it has gone. A move appearing in a dozen
 * games with a poor record is exactly what a repertoire should address, and it
 * is invisible until the games are aggregated by position.
 */
export function ExtractionView({ color }: { color: Color }) {
  const [sortBy, setSortBy] = useState<SortBy>("depth");
  const [minPlayed, setMinPlayed] = useState(1);
  const [maxPly, setMaxPly] = useState(12);
  const [adopting, setAdopting] = useState(false);

  // A live query, so adopting a line immediately re-marks it as covered
  // without a manual refresh.
  const candidates = useLiveQuery(
    () => extractRepertoireCandidates({ color, maxPly }),
    [color, maxPly],
  );

  const visible = useMemo(() => {
    if (!candidates) return [];

    const filtered = candidates.filter((c) => c.played >= minPlayed);

    return [...filtered].sort((a, b) => {
      if (sortBy === "played") return b.played - a.played || a.ply - b.ply;
      if (sortBy === "score") {
        // Lines never decided have no record to rank, so they sort last rather
        // than appearing alongside genuinely even ones.
        if (a.scored === 0 && b.scored === 0) return a.ply - b.ply;
        if (a.scored === 0) return 1;
        if (b.scored === 0) return -1;
        return a.score - b.score || b.played - a.played;
      }
      return a.ply - b.ply || b.played - a.played;
    });
  }, [candidates, minPlayed, sortBy]);

  /**
   * Each candidate written as the line that leads to it, rather than a bare
   * move — "1. e4 c5 2. Nf3" says what the move is; "Nf3" alone does not.
   *
   * Computed into a map rather than as a lookup function: a function closing
   * over the graph would re-run a search for every rendered row on every
   * render, where this runs one per candidate and only when they change.
   */
  const linesByCandidate = useMemo(() => {
    const lines = new Map<string, string>();
    if (!candidates) return lines;

    const graph = buildRepertoireGraph(
      candidates.map((c) => ({ ...c, priority: c.played })),
    );

    for (const candidate of candidates) {
      const prefix = shortestLineTo(graph, REPERTOIRE_ROOT, candidate.fromKey);
      lines.set(
        `${candidate.fromKey}|${candidate.san}`,
        formatSanLine([...(prefix ?? []), candidate.san]),
      );
    }

    return lines;
  }, [candidates]);

  const newOnes = visible.filter((c) => !c.inRepertoire);

  async function adopt(chosen: readonly CandidateWithStatus[]) {
    setAdopting(true);

    try {
      // The unfiltered set is passed as context: adopting a deep line needs the
      // moves leading to it, and those may be hidden by the current filter.
      const result = await adoptCandidates(chosen, candidates ?? chosen);
      toast.success(
        result.added === 1 ? "Added 1 move" : `Added ${result.added} moves`,
      );
    } catch (error) {
      toast.error("Could not add those moves", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setAdopting(false);
    }
  }

  if (!candidates) return <Skeleton className="h-64 rounded-lg" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-muted-foreground flex items-center gap-1 text-sm">
          Sort
          <select
            className={SELECT_CLASS}
            value={sortBy}
            aria-label="Sort candidates"
            onChange={(event) => setSortBy(event.target.value as SortBy)}
          >
            <option value="depth">By depth</option>
            <option value="played">Most played</option>
            <option value="score">Worst record first</option>
          </select>
        </label>

        <label className="text-muted-foreground flex items-center gap-1 text-sm">
          Played at least
          <select
            className={SELECT_CLASS}
            value={minPlayed}
            aria-label="Minimum games"
            onChange={(event) => setMinPlayed(Number(event.target.value))}
          >
            {[1, 2, 3, 5, 10].map((count) => (
              <option key={count} value={count}>
                {count}×
              </option>
            ))}
          </select>
        </label>

        <label className="text-muted-foreground flex items-center gap-1 text-sm">
          Depth
          <select
            className={SELECT_CLASS}
            value={maxPly}
            aria-label="Maximum depth in plies"
            onChange={(event) => setMaxPly(Number(event.target.value))}
          >
            {[6, 8, 12, 16, 20].map((plies) => (
              <option key={plies} value={plies}>
                {plies / 2} moves
              </option>
            ))}
          </select>
        </label>

        <Button
          size="sm"
          className="ml-auto gap-2"
          disabled={adopting || newOnes.length === 0}
          onClick={() => void adopt(newOnes)}
        >
          {adopting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add all {newOnes.length} new
        </Button>
      </div>

      {candidates.length === 0 ? (
        <p className="text-muted-foreground rounded-md border p-4 text-sm">
          No games found for this colour. Extraction reads the games you played,
          so set your name in Settings and import some games first.
        </p>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground rounded-md border p-4 text-sm">
          Nothing played that often. Lower the threshold to see more.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {visible.map((candidate) => (
            <li
              key={`${candidate.fromKey}|${candidate.san}`}
              className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {linesByCandidate.get(`${candidate.fromKey}|${candidate.san}`) ??
                  candidate.san}
              </span>

              <Badge variant="secondary" className="shrink-0 text-xs">
                {candidate.ownMove ? "you play" : "you face"}
              </Badge>

              <span className="text-muted-foreground w-20 shrink-0 text-right tabular-nums">
                {candidate.played}×
              </span>

              <span
                className={cn(
                  "w-24 shrink-0 text-right tabular-nums",
                  candidate.scored === 0
                    ? "text-muted-foreground"
                    : candidate.score >= 0.55
                      ? "text-result-win"
                      : candidate.score <= 0.45
                        ? "text-result-loss"
                        : "text-muted-foreground",
                )}
                title={
                  candidate.scored === 0
                    ? "No finished games yet"
                    : `${candidate.scored} finished game${candidate.scored === 1 ? "" : "s"}`
                }
              >
                {/* Percent of available points, the usual way a line's record is
                    quoted. Undecided lines show a dash rather than a fake 50%. */}
                {candidate.scored === 0
                  ? "—"
                  : `${Math.round(candidate.score * 100)}%`}
              </span>

              {candidate.inRepertoire ? (
                <span className="text-muted-foreground flex w-24 shrink-0 items-center justify-end gap-1 text-xs">
                  <Check className="size-3.5" />
                  in repertoire
                </span>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-24 shrink-0"
                  disabled={adopting}
                  onClick={() => void adopt([candidate])}
                >
                  Add
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
