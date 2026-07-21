import { parseGame } from "@/core/chess/pgn/parse-game";
import type { TreeNode } from "@/core/chess/pgn/parse-tree";
import { writePgn } from "@/core/chess/pgn/write-pgn";
import { saveGame } from "@/persistence/repositories/game-repository";
import { projectGame } from "@/features/games/import/project-game";

export interface SaveGameInput {
  headers: Record<string, string>;
  root: TreeNode;
  /** Names the database owner plays under, for deciding which side was theirs. */
  ownerNames: readonly string[];
  /** Existing game to overwrite, or undefined to create a new one. */
  gameId?: number;
}

/**
 * Persist a game from its headers and move tree.
 *
 * The tree is written to PGN and then parsed back before being stored. That
 * round trip is deliberate: it means what gets saved is exactly what will be
 * read next time, so an annotation the writer cannot express fails here —
 * visibly, at save time — rather than disappearing silently between sessions.
 *
 * @returns The id of the saved game.
 */
export async function persistGame({
  headers,
  root,
  ownerNames,
  gameId,
}: SaveGameInput): Promise<number> {
  const pgn = writePgn(headers, root);

  const parsed = parseGame(pgn);
  const projected = projectGame(pgn, parsed, { ownerNames, now: Date.now() });

  return saveGame(pgn, parsed.positions, projected.record, projected.content, gameId);
}
