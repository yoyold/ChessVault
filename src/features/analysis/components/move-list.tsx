"use client";

import { formatMoveNumber, formatNag } from "@/core/chess/pgn/game-timeline";
import type { TreeNode } from "@/core/chess/pgn/parse-tree";
import { MAX_COMMENT_LENGTH, toDisplayComment } from "@/core/chess/pgn/comment-display";
import type { MoveQuality } from "@/core/analysis/move-quality";
import type { TreePath } from "@/core/chess/pgn/tree-path";
import { cn } from "@/lib/utils";

/** Engine verdicts, shown alongside the annotator's own glyphs rather than replacing them. */
const QUALITY_MARK: Partial<Record<MoveQuality, { label: string; className: string }>> = {
  inaccuracy: { label: "?!", className: "text-yellow-600 dark:text-yellow-400" },
  mistake: { label: "?", className: "text-orange-600 dark:text-orange-400" },
  blunder: { label: "??", className: "text-red-600 dark:text-red-400" },
};

/** Prose of a move's comments, with machine commands and empties removed. */
function visibleCommentText(comments: readonly string[]): string {
  return comments
    .map((comment) => toDisplayComment(comment).text)
    .filter((text) => text.length > 0)
    .join(" ")
    .slice(0, MAX_COMMENT_LENGTH);
}

function samePath(a: TreePath, b: TreePath): boolean {
  return a.length === b.length && a.every((step, index) => step === b[index]);
}

interface MoveListProps {
  /** The whole game, so variations can be shown where they branch. */
  root: TreeNode;
  currentPath: TreePath;
  qualityByPly: Map<number, MoveQuality>;
  onSelect: (path: number[]) => void;
}

/**
 * The game's moves, with variations shown where they branch.
 *
 * Variations are rendered in place rather than only reachable by stepping into
 * them, which is how printed annotation and every chess interface presents
 * them: the alternative belongs next to the move it replaces, and a reader
 * needs to see that a choice existed without having to discover it.
 *
 * Nesting is limited by indentation and a rule down the left, not by
 * parentheses alone — at two or three levels deep, parentheses stop being
 * readable.
 */
export function MoveList({ root, currentPath, qualityByPly, onSelect }: MoveListProps) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[0.95em] leading-relaxed">
      <Line
        node={root}
        path={[]}
        currentPath={currentPath}
        qualityByPly={qualityByPly}
        onSelect={onSelect}
        forceNumber
        inVariation={false}
      />
    </div>
  );
}

/**
 * One continuous line of play, plus any variations branching off it.
 *
 * Written as a loop rather than recursion down the mainline: a long game nests
 * hundreds of moves deep, and recursing per move would both blow the stack and
 * indent the mainline as though every move were a subvariation.
 */
function Line({
  node,
  path,
  currentPath,
  qualityByPly,
  onSelect,
  forceNumber,
  inVariation,
}: {
  node: TreeNode;
  path: number[];
  currentPath: TreePath;
  qualityByPly: Map<number, MoveQuality>;
  onSelect: (path: number[]) => void;
  forceNumber: boolean;
  inVariation: boolean;
}) {
  const output: React.ReactNode[] = [];

  let current = node;
  let currentPathHere = path;
  let needsNumber = forceNumber;

  while (current.children.length > 0) {
    const [mainline, ...alternatives] = current.children;
    const movePath = [...currentPathHere, 0];

    const comment = visibleCommentText(mainline.comments);

    output.push(
      <Move
        key={movePath.join("-")}
        parent={current}
        node={mainline}
        path={movePath}
        selected={samePath(movePath, currentPath)}
        quality={qualityByPly.get(mainline.ply)}
        forceNumber={needsNumber}
        inVariation={inVariation}
        onSelect={onSelect}
      />,
    );

    if (comment) {
      output.push(
        <span
          key={`${movePath.join("-")}-comment`}
          className="text-muted-foreground basis-full text-[0.85em] italic"
        >
          {comment}
        </span>,
      );
    }

    for (const [offset, alternative] of alternatives.entries()) {
      const branchPath = [...currentPathHere, offset + 1];

      output.push(
        <div
          key={branchPath.join("-")}
          className="border-muted-foreground/30 text-muted-foreground basis-full border-l-2 pl-2"
        >
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
            <Move
              parent={current}
              node={alternative}
              path={branchPath}
              selected={samePath(branchPath, currentPath)}
              quality={qualityByPly.get(alternative.ply)}
              forceNumber
              inVariation
              onSelect={onSelect}
            />
            <Line
              node={alternative}
              path={branchPath}
              currentPath={currentPath}
              qualityByPly={qualityByPly}
              onSelect={onSelect}
              forceNumber={false}
              inVariation
            />
          </div>
        </div>,
      );
    }

    // A comment or a variation interrupts the sequence, so the next Black move
    // has to restate its number to stay unambiguous.
    needsNumber = alternatives.length > 0 || comment !== "";

    currentPathHere = movePath;
    current = mainline;
  }

  // Every element already carries a key derived from its path.
  return <>{output}</>;
}

function Move({
  parent,
  node,
  path,
  selected,
  quality,
  forceNumber,
  inVariation,
  onSelect,
}: {
  parent: TreeNode;
  node: TreeNode;
  path: number[];
  selected: boolean;
  quality: MoveQuality | undefined;
  forceNumber: boolean;
  /** Sidelines are set back so the game as played stays the dominant reading. */
  inVariation: boolean;
  onSelect: (path: number[]) => void;
}) {
  const mark = quality ? QUALITY_MARK[quality] : undefined;
  const showNumber = parent.sideToMove === "w" || forceNumber;

  return (
    <span className="inline-flex items-baseline gap-1">
      {showNumber ? (
        // `formatMoveNumber` already distinguishes the colours, rendering
        // "12." for White and "12..." for Black.
        <span className="text-muted-foreground/70 tabular-nums">
          {formatMoveNumber(node.ply)}
        </span>
      ) : null}

      <button
        type="button"
        onClick={() => onSelect(path)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "rounded px-1 font-medium transition-colors",
          selected
            ? // The strongest contrast in the panel: the current move must be
              // findable at a glance in a wall of similar text.
              "bg-primary text-primary-foreground"
            : inVariation
              ? "text-muted-foreground hover:bg-accent hover:text-foreground"
              : "text-foreground hover:bg-accent",
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
    </span>
  );
}
