import { Chess } from "chess.js";
import {
  positionKeyFromEngineFen,
  type PositionKey,
} from "@/core/chess/position-key";
import { parseTagPairs } from "./tag-pairs";

/** Raised when a game cannot be parsed, so one bad game never aborts an import. */
export class PgnParseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PgnParseError";
  }
}

export interface ParsedPosition {
  /** 0 is the position before White's first move. */
  ply: number;
  key: PositionKey;
  /** The move producing this position, in SAN; null at ply 0. */
  san: string | null;
}

export interface ParsedGame {
  headers: Record<string, string>;
  sanMoves: string[];
  positions: ParsedPosition[];
  /** Position after the final move, or the starting position for a game with no moves. */
  finalFen: string;
  plyCount: number;
}

/**
 * Parse a single game's PGN into the data the import pipeline persists.
 *
 * Positions come from the verbose move history rather than from replaying the
 * game a second time. chess.js already carries the FEN before and after every
 * move, and those FENs are en-passant normalised, so the position key can be
 * cut straight out of them. On a large import this removes an entire replay
 * pass and a `Chess` construction per ply.
 *
 * Only the mainline is recorded. Sidelines in the PGN are preserved in the
 * stored text and remain available for later analysis, but they are not part of
 * the game's own position history.
 *
 * @throws PgnParseError if the movetext is not legal chess.
 */
export function parseGame(pgn: string): ParsedGame {
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

  // Headers are parsed from the raw text, not read back from chess.js, which
  // substitutes placeholder values for absent mandatory tags. See tag-pairs.ts.
  const headers = parseTagPairs(pgn);

  // With no moves there is no history to read a starting FEN from, and the
  // instance still sits on the starting position — which is also the final one.
  // This covers `[SetUp "1"]` games and result-only stubs, both common in
  // exported collections.
  const startFen = history.length > 0 ? history[0].before : chess.fen();
  const finalFen = history.length > 0 ? history[history.length - 1].after : startFen;

  const positions: ParsedPosition[] = [
    { ply: 0, key: positionKeyFromEngineFen(startFen), san: null },
    ...history.map((move, index) => ({
      ply: index + 1,
      key: positionKeyFromEngineFen(move.after),
      san: move.san,
    })),
  ];

  return {
    headers,
    sanMoves: history.map((move) => move.san),
    positions,
    finalFen,
    plyCount: history.length,
  };
}
