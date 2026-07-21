import { Chess } from "chess.js";
import { parsePgn, type ChildNode, type PgnNodeData } from "chessops/pgn";
import {
  positionKeyFromEngineFen,
  type PositionKey,
} from "@/core/chess/position-key";
import { parseTagPairs } from "./tag-pairs";
import { PgnParseError } from "./errors";

/**
 * A position in the game, together with the move that reached it.
 *
 * `children[0]` is the mainline continuation; any further entries are
 * alternatives given as variations in the source. This mirrors the shape of the
 * PGN itself, so a move and its alternatives stay together rather than being
 * flattened into an ordering that has to be reconstructed later.
 */
export interface TreeNode {
  /** Distance from the start of the game. 0 is the position before White's first move. */
  ply: number;
  /** Complete FEN, including move counters, as an engine needs it. */
  fen: string;
  key: PositionKey;
  /** The move that produced this position, in SAN; null at the root. */
  san: string | null;
  /** The same move in UCI long algebraic notation; null at the root. */
  uci: string | null;
  /**
   * Whose turn it is in this position.
   *
   * Derived here rather than by each consumer: it decides which player a move
   * is charged to in a game report, and getting it wrong misattributes every
   * mistake to the opponent.
   */
  sideToMove: "w" | "b";
  /** Comments attached to this move, in source order. */
  comments: string[];
  /** Numeric annotation glyphs attached to this move, e.g. 2 for a mistake. */
  nags: number[];
  children: TreeNode[];
}

export interface ParsedGameTree {
  headers: Record<string, string>;
  root: TreeNode;
  /**
   * Variations dropped because a move in them was not legal.
   *
   * Source files do contain broken sidelines. Dropping the offending branch
   * keeps the rest of the game usable, but the count is reported rather than
   * hidden so a game is never silently shown as more complete than it is.
   */
  droppedVariations: number;
}

/**
 * Parse a game into its full move tree, preserving comments and variations.
 *
 * Two libraries, each for what it does well.
 *
 * **chessops parses the PGN.** Its grammar accepts constructs that chess.js
 * rejects outright — a comment or glyph opening a variation, consecutive
 * comments — which cost roughly a third of the games in a real annotated
 * collection.
 *
 * **chess.js replays the moves.** Position keys are derived from its FEN
 * output, and they are the identity under which positions, evaluations and
 * notes are already stored. Deriving them from a different library risks a
 * subtle disagreement — over the en-passant field in particular — that would
 * silently split identical positions and orphan stored evaluations. Keeping the
 * generator unchanged removes that risk entirely.
 *
 * @throws PgnParseError if the file yields no game, or the mainline is illegal.
 */
export function parseGameTree(pgn: string): ParsedGameTree {
  const games = parsePgn(pgn);

  if (games.length === 0) {
    throw new PgnParseError("No game found in PGN");
  }

  // Headers come from the raw text, not from the parser: chessops fills in the
  // seven mandatory tags, so a file that omitted `Site` would come back
  // carrying "?" as though it had been written that way.
  const headers = parseTagPairs(pgn);

  const startFen = startingFen(headers);

  const board = createBoard(startFen);

  const root: TreeNode = {
    ply: 0,
    fen: board.fen(),
    key: positionKeyFromEngineFen(board.fen()),
    san: null,
    uci: null,
    sideToMove: board.turn(),
    comments: games[0].comments ?? [],
    nags: [],
    children: [],
  };

  const dropped = { count: 0 };
  buildChildren(root, games[0].moves.children, dropped, true);

  return { headers, root, droppedVariations: dropped.count };
}

/** Starting position, honouring a set-up position given in the headers. */
function startingFen(headers: Record<string, string>): string | undefined {
  return headers.FEN?.trim() || undefined;
}

function createBoard(fen: string | undefined): Chess {
  try {
    return fen ? new Chess(fen) : new Chess();
  } catch (cause) {
    throw new PgnParseError(
      `Invalid starting position: ${cause instanceof Error ? cause.message : "unknown"}`,
      { cause },
    );
  }
}

/**
 * Attach chessops' children to a node, replaying each through chess.js.
 *
 * @param isMainline Whether this branch is the game's actual continuation. An
 *   illegal move there is a broken game; in a variation it is a broken sideline
 *   and only that branch is discarded.
 */
function buildChildren(
  parent: TreeNode,
  children: ChildNode<PgnNodeData>[],
  dropped: { count: number },
  isMainline: boolean,
): void {
  children.forEach((child, index) => {
    // Each branch replays from the parent position; siblings must not inherit
    // the moves of the branch explored before them.
    const board = createBoard(parent.fen);

    const move = tryMove(board, child.data.san);

    if (!move) {
      if (isMainline && index === 0) {
        throw new PgnParseError(`Illegal move in mainline: ${child.data.san}`);
      }

      dropped.count += 1;
      return;
    }

    const node: TreeNode = {
      ply: parent.ply + 1,
      fen: board.fen(),
      key: positionKeyFromEngineFen(board.fen()),
      san: move.san,
      uci: move.lan,
      sideToMove: board.turn(),
      // `startingComments` sit before the move in the source, `comments` after.
      // Both describe this move, so they are kept together in reading order.
      comments: [...(child.data.startingComments ?? []), ...(child.data.comments ?? [])],
      nags: child.data.nags ?? [],
      children: [],
    };

    parent.children.push(node);

    buildChildren(node, child.children, dropped, isMainline && index === 0);
  });
}

function tryMove(board: Chess, san: string) {
  try {
    return board.move(san);
  } catch {
    return null;
  }
}

/** Walk the mainline: the root followed by the first child at each step. */
export function mainline(root: TreeNode): TreeNode[] {
  const line: TreeNode[] = [root];

  let node = root;
  while (node.children.length > 0) {
    node = node.children[0];
    line.push(node);
  }

  return line;
}
