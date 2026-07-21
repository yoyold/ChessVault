import type { TreeNode } from "./parse-tree";

/**
 * A position in the move tree, as the child index chosen at each step.
 *
 * `[]` is the starting position. `[0, 0, 1]` is: mainline, mainline, then the
 * first alternative — which is how a reader reaches a sideline.
 *
 * Indices rather than node references so the path stays comparable, storable
 * and safe to hold across a reparse.
 */
export type TreePath = readonly number[];

/** The node a path points at, or the root for an empty or unreachable path. */
export function nodeAtPath(root: TreeNode, path: TreePath): TreeNode {
  let node = root;

  for (const index of path) {
    const child = node.children[index];
    // An unreachable path resolves to the deepest node that does exist rather
    // than throwing: a stale path should degrade, not break the view.
    if (!child) return node;
    node = child;
  }

  return node;
}

/** Trim a path to the deepest prefix that actually resolves. */
export function clampPath(root: TreeNode, path: TreePath): number[] {
  const valid: number[] = [];
  let node = root;

  for (const index of path) {
    const child = node.children[index];
    if (!child) break;

    valid.push(index);
    node = child;
  }

  return valid;
}

/**
 * The line to display for a path: the moves leading to it, then the mainline
 * continuation from there.
 *
 * This is how chess software presents a sideline — the moves you played to get
 * here, followed by how this branch continues — rather than always showing the
 * game's mainline regardless of where the reader is.
 */
export function displayLine(root: TreeNode, path: TreePath): TreeNode[] {
  const line: TreeNode[] = [root];
  let node = root;

  for (const index of path) {
    const child = node.children[index];
    if (!child) break;

    line.push(child);
    node = child;
  }

  while (node.children.length > 0) {
    node = node.children[0];
    line.push(node);
  }

  return line;
}

/** Path one move further along the current branch, or null at the end. */
export function nextPath(root: TreeNode, path: TreePath): number[] | null {
  const node = nodeAtPath(root, path);
  if (node.children.length === 0) return null;

  return [...path, 0];
}

/** Path one move back, or null at the start. */
export function previousPath(path: TreePath): number[] | null {
  return path.length === 0 ? null : path.slice(0, -1);
}

/** Path to the end of the current branch. */
export function endOfLinePath(root: TreeNode, path: TreePath): number[] {
  const result = [...path];
  let node = nodeAtPath(root, path);

  while (node.children.length > 0) {
    result.push(0);
    node = node.children[0];
  }

  return result;
}

/**
 * Switch the last step of a path to a different alternative.
 *
 * Used to step sideways from a move into one of its alternatives, keeping
 * everything before it intact.
 */
export function switchVariation(path: TreePath, childIndex: number): number[] {
  if (path.length === 0) return [childIndex];

  return [...path.slice(0, -1), childIndex];
}

/** Alternatives to the move at a path, excluding the move itself. */
export function alternativesAt(
  root: TreeNode,
  path: TreePath,
): { index: number; node: TreeNode }[] {
  if (path.length === 0) return [];

  const parent = nodeAtPath(root, path.slice(0, -1));
  const chosen = path[path.length - 1];

  return parent.children
    .map((node, index) => ({ index, node }))
    .filter((entry) => entry.index !== chosen);
}
