import { Chess } from "chess.js";
import {
  positionKeyFromEngineFen,
  type PositionKey,
} from "@/core/chess/position-key";
import { PgnParseError } from "./parse-game";

export interface TimelineNode {
  /** 0 is the starting position, before White's first move. */
  ply: number;
  /** Complete FEN, including move counters, as the engine needs it. */
  fen: string;
  key: PositionKey;
  /** The move that produced this position, in SAN; null at ply 0. */
  san: string | null;
  /**
   * The same move in UCI long algebraic notation (`e2e4`), or null at ply 0.
   *
   * Engines report variations in this notation, so comparing the played move
   * against the engine's choice needs it without re-deriving the conversion.
   */
  uci: string | null;
  /** Whose turn it is in this position. */
  sideToMove: "w" | "b";
}

/**
 * Expand a game into the full position at every ply.
 *
 * Separate from the import pipeline on purpose. Import stores only position
 * keys, which omit move counters and so cannot be handed to an engine; keeping
 * full FENs for every ply of every game would multiply storage for data only
 * ever needed one game at a time. This rebuilds them on demand instead.
 *
 * @throws PgnParseError if the movetext is not legal chess.
 */
export function buildTimeline(pgn: string): TimelineNode[] {
  const chess = new Chess();

  try {
    chess.loadPgn(pgn);
  } catch (cause) {
    throw new PgnParseError(
      cause instanceof Error ? cause.message : "Unparseable PGN",
      { cause },
    );
  }

  const history = chess.history({ verbose: true });

  const startFen = history.length > 0 ? history[0].before : chess.fen();

  const nodes: TimelineNode[] = [
    {
      ply: 0,
      fen: startFen,
      key: positionKeyFromEngineFen(startFen),
      san: null,
      uci: null,
      sideToMove: sideToMoveOfFen(startFen),
    },
  ];

  history.forEach((move, index) => {
    nodes.push({
      ply: index + 1,
      fen: move.after,
      key: positionKeyFromEngineFen(move.after),
      san: move.san,
      uci: move.lan,
      sideToMove: sideToMoveOfFen(move.after),
    });
  });

  return nodes;
}

function sideToMoveOfFen(fen: string): "w" | "b" {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

/** Render a ply number as a move number with colour, e.g. `12...` for Black's 12th. */
export function formatMoveNumber(ply: number): string {
  if (ply === 0) return "";

  const moveNumber = Math.ceil(ply / 2);

  return ply % 2 === 1 ? `${moveNumber}.` : `${moveNumber}...`;
}
