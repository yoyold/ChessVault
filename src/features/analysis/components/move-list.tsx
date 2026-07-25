"use client";

import { useEffect, useRef } from "react";
import { formatMoveNumber, formatNag } from "@/core/chess/pgn/game-timeline";
import type { TreeNode } from "@/core/chess/pgn/parse-tree";
import { MAX_COMMENT_LENGTH, toDisplayComment } from "@/core/chess/pgn/comment-display";
import type { MoveQuality } from "@/core/analysis/move-quality";
import {
  MOVE_SYMBOL_COLOR,
  MOVE_SYMBOL_INK,
  symbolForMove,
  symbolForNag,
} from "@/core/analysis/move-symbols";
import type { TreePath } from "@/core/chess/pgn/tree-path";
import { cn } from "@/lib/utils";

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
  /** Applied to the scroll container, so the caller sizes it. */
  className?: string;
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
export function MoveList({
  root,
  currentPath,
  qualityByPly,
  onSelect,
  className,
}: MoveListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // The path as a value rather than the array itself: a new array with the same
  // steps arrives on every render, and re-centring on each of them would drag
  // the list back while the reader is scrolling through it — the engine alone
  // re-renders several times a second.
  const pathKey = currentPath.join("-");

  useEffect(() => {
    const container = containerRef.current;
    const move = container?.querySelector('[aria-current="true"]');
    if (!container || !move) return;

    /*
     * Scrolled by hand rather than with `scrollIntoView`.
     *
     * `scrollIntoView` walks up every scrollable ancestor, so in a page that
     * also scrolls it moves the whole view to reach a move — the panel is
     * pinned to the viewport precisely so that cannot happen. Adjusting this
     * container's own offset moves nothing else, and the arithmetic is what
     * puts the move in the middle rather than merely inside the box.
     */
    const box = container.getBoundingClientRect();
    const target = move.getBoundingClientRect();

    container.scrollTop +=
      target.top - box.top - (box.height - target.height) / 2;
  }, [pathKey]);

  return (
    <div ref={containerRef} className={cn("overflow-auto", className)}>
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
  const symbol = symbolForMove(node.nags, quality);
  const showNumber = parent.sideToMove === "w" || forceNumber;

  // The move glyph is drawn as a badge, so the glyph it came from must not also
  // appear as text. What is left describes the position rather than the move —
  // "⩲" and its kin — and still belongs next to the move.
  const positionalNags = node.nags.filter((nag) => symbolForNag(nag) === null);

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
        {positionalNags.map((nag) => (
          <span key={nag} className="text-muted-foreground">
            {formatNag(nag)}
          </span>
        ))}
        {symbol ? (
          // A filled badge rather than coloured text, and the same one the
          // board draws. Coloured text would have to read on four different
          // backgrounds — page and selected move, in both themes — and the
          // lighter half of the palette fails on at least one of them.
          <span
            className="ml-1 rounded-[0.25em] px-[0.3em] py-[0.05em] align-baseline text-[0.8em] font-bold"
            style={{
              backgroundColor: MOVE_SYMBOL_COLOR[symbol],
              color: MOVE_SYMBOL_INK,
            }}
          >
            {symbol}
          </span>
        ) : null}
      </button>
    </span>
  );
}
