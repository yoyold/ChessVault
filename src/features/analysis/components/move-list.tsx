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
  const centred = useRef<{ key: string; offset: number } | null>(null);

  // The path as a value rather than the array itself: a new array with the same
  // steps arrives on every render, and re-centring on each of them would drag
  // the list back while the reader is scrolling through it — the engine alone
  // re-renders several times a second.
  const pathKey = currentPath.join("-");

  /*
   * Deliberately without a dependency list.
   *
   * Selecting another move is not the only thing that decants the current one
   * out of view: comments, badges and stored evaluations all arrive after the
   * game does, and each reflows a list that wraps. Content appearing above the
   * current move pushes it down without the selection changing at all, so a
   * centring keyed on the selection alone runs once and is then quietly
   * invalidated. Running every render and comparing where the move actually
   * sits catches both causes, and the comparison makes it a no-op otherwise —
   * which is what keeps it from fighting the reader's own scrolling.
   */
  useEffect(() => {
    const container = containerRef.current;
    const content = container?.firstElementChild as HTMLElement | null;
    const move = container?.querySelector('[aria-current="true"]');
    if (!container || !content || !move) return;

    // Measured against the content rather than the page: both share an offset
    // parent, so the difference is the move's place in the list and nothing
    // else. Taking the raw offset would also react to the engine panel above
    // changing height, and re-centre while the reader is looking elsewhere.
    const offset = (move as HTMLElement).offsetTop - content.offsetTop;
    if (centred.current?.key === pathKey && centred.current.offset === offset) {
      return;
    }
    centred.current = { key: pathKey, offset };

    /*
     * Scrolled by hand rather than with `scrollIntoView`.
     *
     * `scrollIntoView` walks up every scrollable ancestor, so in a page that
     * also scrolls it moves the whole view to reach a move — the panel is
     * pinned to the viewport precisely so that cannot happen. Adjusting this
     * container's own offset moves nothing else, and the arithmetic is what
     * puts the move in the middle rather than merely inside the box.
     *
     * Centred on the visible slice, not on the panel. Until the page is
     * scrolled the panel begins below the heading and its lower edge falls
     * past the bottom of the window, so the middle of the box and the middle
     * of the screen are not the same place — and the box's middle is the one
     * that can sit off screen.
     */
    const box = container.getBoundingClientRect();
    const target = move.getBoundingClientRect();
    const visibleTop = Math.max(box.top, 0);
    const visibleBottom = Math.min(box.bottom, window.innerHeight);

    container.scrollTop +=
      target.top + target.height / 2 - (visibleTop + visibleBottom) / 2;
  });

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
      output.push(<Comment key={`${movePath.join("-")}-comment`} text={comment} />);
    }

    for (const [offset, alternative] of alternatives.entries()) {
      const branchPath = [...currentPathHere, offset + 1];

      // The move that opens a variation carries its own comment, and it was
      // the one comment the list never showed: only moves reached as the
      // continuation of a line were rendered with theirs, and a branch's first
      // move is reached as the branch itself.
      const branchComment = visibleCommentText(alternative.comments);

      output.push(
        <div
          key={branchPath.join("-")}
          className="border-muted-foreground/50 bg-muted/40 text-muted-foreground basis-full rounded-r-sm border-l-2 py-0.5 pr-1 pl-2 text-[0.9em]"
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
            {branchComment ? <Comment text={branchComment} /> : null}
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

/**
 * A move's prose, on a line of its own.
 *
 * `basis-full` breaks the flex row so a comment never sits between two moves
 * as though it were one of them.
 */
function Comment({ text }: { text: string }) {
  return (
    <span className="text-muted-foreground basis-full text-[0.85em] italic">
      {text}
    </span>
  );
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
          "rounded px-1 transition-colors",
          selected
            ? // The strongest contrast in the panel: the current move must be
              // findable at a glance in a wall of similar text.
              "bg-primary text-primary-foreground font-semibold"
            : inVariation
              ? // Set back on three counts at once — weight, colour and, from
                // the enclosing block, size. Any one of them alone left the two
                // kinds of line reading as the same text.
                "text-muted-foreground font-normal hover:bg-accent hover:text-foreground"
              : "text-foreground font-semibold hover:bg-accent",
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
