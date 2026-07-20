import type { GameRecord, GameResult } from "@/core/domain/game";
import type { ParsedGame } from "@/core/chess/pgn/parse-game";
import { gameContentHash } from "@/core/chess/pgn/content-hash";
import { normalisePgnDate } from "@/core/chess/pgn/pgn-date";
import { buildSearchTokens } from "@/core/chess/search-tokens";
import { matchesAnyPlayer } from "@/core/chess/player-identity";

export interface ProjectGameOptions {
  /** Names the database owner plays under, used to decide which colour they had. */
  ownerNames: readonly string[];
  /** Injected so imports are deterministic and testable. */
  now: number;
}

const VALID_RESULTS = new Set<GameResult>(["1-0", "0-1", "1/2-1/2", "*"]);

/**
 * Normalise a PGN result tag.
 *
 * `½-½` appears in files produced by European database software and from
 * copy-paste out of printed sources. Left unmapped it would fall back to "*",
 * quietly turning every such draw into an unfinished game and skewing win rates.
 */
function normaliseResult(raw: string | undefined): GameResult {
  if (!raw) return "*";

  const normalised = raw.trim().replace(/½/g, "1/2");

  return VALID_RESULTS.has(normalised as GameResult)
    ? (normalised as GameResult)
    : "*";
}

function headerOrNull(headers: Record<string, string>, key: string): string | null {
  const value = headers[key]?.trim();
  // Treat "?" as absent: PGN uses it as an explicit placeholder for unknown.
  return value && value !== "?" ? value : null;
}

/**
 * Build the indexed, queryable record for a parsed game.
 *
 * Every field here is a projection of the PGN, denormalised so the game list
 * can filter and sort without reparsing. The PGN remains the source of truth;
 * if the two ever disagree, the projection is what gets rebuilt.
 */
export function projectGame(
  pgn: string,
  parsed: ParsedGame,
  options: ProjectGameOptions,
): GameRecord {
  const { headers } = parsed;

  const white = headerOrNull(headers, "White") ?? "";
  const black = headerOrNull(headers, "Black") ?? "";
  const event = headerOrNull(headers, "Event");
  const site = headerOrNull(headers, "Site");
  const opening = headerOrNull(headers, "Opening");

  // White is checked first, so an owner playing both sides of a training game
  // is recorded as White rather than left unattributed.
  let playerColor: GameRecord["playerColor"] = null;
  if (matchesAnyPlayer(white, options.ownerNames)) playerColor = "white";
  else if (matchesAnyPlayer(black, options.ownerNames)) playerColor = "black";

  return {
    pgn,
    contentHash: gameContentHash(pgn),
    headers,
    white,
    black,
    result: normaliseResult(headers.Result),
    dateIso: normalisePgnDate(headers.Date),
    event,
    site,
    round: headerOrNull(headers, "Round"),
    eco: headerOrNull(headers, "ECO"),
    opening,
    timeControl: headerOrNull(headers, "TimeControl"),
    playerColor,
    tags: [],
    notes: "",
    plyCount: parsed.plyCount,
    finalFen: parsed.finalFen,
    searchTokens: buildSearchTokens(white, black, event, site, opening),
    importedAt: options.now,
    updatedAt: options.now,
  };
}
