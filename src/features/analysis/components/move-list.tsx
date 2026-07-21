"use client";

import { formatMoveNumber, formatNag } from "@/core/chess/pgn/game-timeline";
import {
  MAX_COMMENT_LENGTH,
  toDisplayComment,
} from "@/core/chess/pgn/comment-display";
import type { TreeNode } from "@/core/chess/pgn/parse-tree";
import type { MoveQuality } from "@/core/analysis/move-quality";
import type { TreePath } from "@/core/chess/pgn/tree-path";
import { cn } from "@/lib/utils";

/** Engine verdicts, shown alongside the annotator's own glyphs rather than replacing them. */
const QUALITY_MARK: Partial<Record<MoveQuality, { label: string; className: string }>> = {
  inaccuracy: { label: "?!", className: "text-yellow-600 dark:text-yellow-500" },
  mistake: { label: "?", className: "text-orange-600 dark:text-orange-500" },
  blunder: { label: "??", className: "text-red-600 dark:text-red-500" },
};

interface MoveListProps {
  /** Moves of the branch currently being read, root first. */
  line: TreeNode[];
  /** Path to the currently selected move, used to mark it and to build paths. */
  currentPath: TreePath;
  qualityByPly: Map<number, MoveQuality>;
  onSelect: (path: number[]) => void;
}

/**
 * The moves of the current branch.
 *
 * Comments are rendered inline between moves, as in printed annotation, so a
 * remark stays next to the move it is about instead of being relegated to a
 * separate panel where the connection is lost.
 */
export function MoveList({ line, currentPath, qualityByPly, onSelect }: MoveListProps) {
  return (
    <ol className="flex max-h-72 flex-wrap items-baseline gap-x-1 gap-y-1 overflow-auto text-sm">
      {line.slice(1).map((node, index) => {
        // The line is the path followed by its mainline continuation, so a move
        // beyond the current path continues along first children.
        const path =
          index < currentPath.length
            ? currentPath.slice(0, index + 1)
            : [...currentPath, ...Array(index + 1 - currentPath.length).fill(0)];

        const isCurrent =
          path.length === currentPath.length &&
          path.every((step, i) => step === currentPath[i]);

        const mark = QUALITY_MARK[qualityByPly.get(node.ply) ?? "good"];

        return (
          <li key={`${node.ply}-${node.san}`} className="flex items-baseline gap-1">
            {node.ply % 2 === 1 ? (
              <span className="text-muted-foreground tabular-nums">
                {formatMoveNumber(node.ply)}
              </span>
            ) : null}

            <button
              type="button"
              onClick={() => onSelect(path)}
              className={cn(
                "rounded px-1",
                isCurrent ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
              )}
            >
              {node.san}
              {node.nags.map((nag) => (
                <span key={nag} className="text-muted-foreground">
                  {formatNag(nag)}
                </span>
              ))}
              {mark ? <span className={mark.className}>{mark.label}</span> : null}
            </button>

            {node.comments.length > 0 ? (
              // Capped: an unbounded comment from a damaged file can be
              // hundreds of thousands of characters and freezes the page.
              <span className="text-muted-foreground max-w-full text-xs italic">
                {node.comments
                  .map((comment) => toDisplayComment(comment).text)
                  .join(" ")
                  .slice(0, MAX_COMMENT_LENGTH)}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
