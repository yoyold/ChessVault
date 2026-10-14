import { Chess } from "chess.js";
import { castlingSide, Chess as Position } from "chessops/chess";
import { makeFen, parseFen } from "chessops/fen";
import { parsePgn, type ChildNode, type PgnNodeData } from "chessops/pgn";
import { makeSanAndPlay, parseSan } from "chessops/san";
import type { NormalMove } from "chessops/types";
import { charToRole, kingCastlesTo, makeUci, parseSquare } from "chessops/util";
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
 * **chessops replays the moves**, several times faster than chess.js, which
 * made replaying most of the cost of an import. Position keys are the
 * identity under which positions, evaluations and notes are stored, so the
 * switch had to leave every one of them as chess.js wrote it. It does: both
 * write the en-passant square only when the capture is legal, pins included,
 * and `parse-tree.test.ts` holds the cases where that matters. chess.js still
 * sets up the starting position, normalising a FEN from the file, and reads
 * any move chessops cannot, so no game that imported before is refused now.
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
  const fen = board.fen();

  const root: TreeNode = {
    ply: 0,
    fen,
    key: positionKeyFromEngineFen(fen),
    san: null,
    uci: null,
    sideToMove: board.turn(),
    comments: games[0].comments ?? [],
    nags: [],
    children: [],
  };

  const dropped = { count: 0 };
  const position = Position.fromSetup(parseFen(fen).unwrap()).unwrap();
  buildChildren(root, position, games[0].moves.children, dropped, true);

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
 * The first child continues on the board it is handed, which stands at the
 * parent's position; only alternatives get a board of their own, set up from
 * the parent's FEN. Setting up a board is the expensive part of replaying a
 * move, and doing it for every ply made it most of the cost of an import —
 * while variations, the only moves that need it, are a small share of any
 * game.
 *
 * @param board Standing at the parent's position. Moved on by the first child.
 * @param isMainline Whether this branch is the game's actual continuation. An
 *   illegal move there is a broken game; in a variation it is a broken sideline
 *   and only that branch is discarded.
 */
function buildChildren(
  parent: TreeNode,
  parentBoard: Position,
  children: ChildNode<PgnNodeData>[],
  dropped: { count: number },
  isMainline: boolean,
): void {
  // Alternatives are set up before the first child moves the parent's board
  // on: each replays from the parent position, and must not inherit the moves
  // of the branch explored before it.
  const boards = children.map((_, index) => (index === 0 ? parentBoard : parentBoard.clone()));

  children.forEach((child, index) => {
    const board = boards[index];
    const move = playSan(board, child.data.san);

    if (!move) {
      if (isMainline && index === 0) {
        throw new PgnParseError(`Illegal move in mainline: ${child.data.san}`);
      }

      dropped.count += 1;
      return;
    }

    const fen = makeFen(board.toSetup());
    const node: TreeNode = {
      ply: parent.ply + 1,
      fen,
      key: positionKeyFromEngineFen(fen),
      san: move.san,
      uci: move.uci,
      sideToMove: board.turn === "white" ? "w" : "b",
      // `startingComments` sit before the move in the source, `comments` after.
      // Both describe this move, so they are kept together in reading order.
      comments: [...(child.data.startingComments ?? []), ...(child.data.comments ?? [])],
      nags: child.data.nags ?? [],
      children: [],
    };

    parent.children.push(node);

    buildChildren(node, board, child.children, dropped, isMainline && index === 0);
  });
}

/**
 * Play a move given in SAN, returning it as written in SAN and UCI.
 *
 * The SAN is written afresh rather than echoed from the file, so the same
 * move is always spelled the same way. Castling is reported as the king's own
 * move, `e1g1`, not as chessops' king-takes-rook.
 */
function playSan(board: Position, san: string): { san: string; uci: string } | null {
  const move = parseSan(board, san) ?? readWithChessJs(board, san);
  if (!move || !("from" in move)) return null;

  const side = castlingSide(board, move);
  const uci = makeUci(side ? { ...move, to: kingCastlesTo(board.turn, side) } : move);

  return { san: makeSanAndPlay(board, move), uci };
}

/**
 * Read a move chessops' SAN parser does not accept, such as castling written
 * with zeros. chess.js is more forgiving with notation and was the parser every
 * stored game went through, so anything it accepted still imports.
 */
function readWithChessJs(board: Position, san: string): NormalMove | undefined {
  let played;
  try {
    played = new Chess(makeFen(board.toSetup())).move(san);
  } catch {
    return undefined;
  }

  const from = parseSquare(played.from);
  const to = parseSquare(played.to);
  if (from === undefined || to === undefined) return undefined;

  // chessops moves the king onto its own rook to castle.
  const side = played.isKingsideCastle() ? "h" : played.isQueensideCastle() ? "a" : null;
  const move: NormalMove = {
    from,
    to: side ? (board.castles.rook[board.turn][side] ?? to) : to,
    promotion: played.promotion ? charToRole(played.promotion) : undefined,
  };

  return board.isLegal(move) ? move : undefined;
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
