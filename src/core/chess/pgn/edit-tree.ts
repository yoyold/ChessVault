import { Chess } from "chess.js";
import { positionKeyFromEngineFen } from "@/core/chess/position-key";
import type { TreeNode } from "./parse-tree";
import { nodeAtPath, type TreePath } from "./tree-path";

/**
 * Rebuild the tree with one node replaced.
 *
 * Every operation here returns a new tree rather than mutating in place, and
 * shares the branches it did not touch. React compares by reference, so an
 * in-place edit would leave the view showing stale content; and an undo stack,
 * if one is added later, gets the old tree for free.
 */
function replaceNodeAt(
  root: TreeNode,
  path: TreePath,
  update: (node: TreeNode) => TreeNode,
): TreeNode {
  if (path.length === 0) return update(root);

  const [index, ...rest] = path;
  const child = root.children[index];
  if (!child) return root;

  const children = [...root.children];
  children[index] = replaceNodeAt(child, rest, update);

  return { ...root, children };
}

/** Set the comments attached to a move. */
export function withComments(
  root: TreeNode,
  path: TreePath,
  comments: string[],
): TreeNode {
  // Empty strings are dropped: an empty comment writes `{}` into the PGN, which
  // is noise a reader has to skip past and which no one intended to add.
  const cleaned = comments.map((c) => c.trim()).filter((c) => c !== "");

  return replaceNodeAt(root, path, (node) => ({ ...node, comments: cleaned }));
}

/**
 * Set the annotation glyphs on a move.
 *
 * Only one glyph of each kind is meaningful — a move is not both `!` and `?` —
 * so the caller passes the full set rather than appending.
 */
export function withNags(root: TreeNode, path: TreePath, nags: number[]): TreeNode {
  const unique = [...new Set(nags)].sort((a, b) => a - b);

  return replaceNodeAt(root, path, (node) => ({ ...node, nags: unique }));
}

export interface AddMoveResult {
  root: TreeNode;
  /** Path to the added move, or to the existing one if it was already there. */
  path: number[];
  /** False when the move was already present and nothing was added. */
  added: boolean;
}

/**
 * Add a move at a position, as a continuation or as an alternative.
 *
 * If the move is already among the node's children it is not duplicated — the
 * caller is simply navigated to it. Playing a move that already exists is how
 * someone walks into a variation they wrote earlier, and adding a second copy
 * would silently corrupt the game.
 *
 * @returns null if the move is not legal in this position.
 */
export function addMove(
  root: TreeNode,
  path: TreePath,
  san: string,
): AddMoveResult | null {
  const parent = nodeAtPath(root, path);

  const existing = parent.children.findIndex((child) => child.san === san);
  if (existing !== -1) {
    return { root, path: [...path, existing], added: false };
  }

  const board = new Chess(parent.fen);

  let move;
  try {
    move = board.move(san);
  } catch {
    return null;
  }

  const fen = board.fen();

  const node: TreeNode = {
    ply: parent.ply + 1,
    fen,
    key: positionKeyFromEngineFen(fen),
    san: move.san,
    uci: move.lan,
    sideToMove: board.turn(),
    comments: [],
    nags: [],
    children: [],
  };

  const nextRoot = replaceNodeAt(root, path, (target) => ({
    ...target,
    children: [...target.children, node],
  }));

  return { root: nextRoot, path: [...path, parent.children.length], added: true };
}

/**
 * Remove a move and everything that follows it.
 *
 * Removing the root is refused: a game without its starting position is not a
 * game, and the caller almost certainly meant something else.
 */
export function removeNode(root: TreeNode, path: TreePath): TreeNode {
  if (path.length === 0) return root;

  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];

  return replaceNodeAt(root, parentPath, (parent) => ({
    ...parent,
    children: parent.children.filter((_, i) => i !== index),
  }));
}

/**
 * Make a variation the main line at its branching point.
 *
 * The line that was main becomes the first alternative, so nothing is lost —
 * promotion reorders, it does not replace.
 */
export function promoteVariation(root: TreeNode, path: TreePath): TreeNode {
  if (path.length === 0) return root;

  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];

  if (index === 0) return root;

  return replaceNodeAt(root, parentPath, (parent) => {
    const children = [...parent.children];
    const [promoted] = children.splice(index, 1);

    return { ...parent, children: [promoted, ...children] };
  });
}

/** Path to the same move after a promotion, so the view can stay where it was. */
export function pathAfterPromotion(path: TreePath): number[] {
  if (path.length === 0) return [];

  return [...path.slice(0, -1), 0];
}
