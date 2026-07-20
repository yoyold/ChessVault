import { isTagPairLine } from "./tag-pairs";

/**
 * Track `{ }` comment nesting across a line, returning the depth at its end.
 *
 * PGN comments do not nest, but tracking a depth rather than a boolean makes
 * stray braces inside a comment harmless instead of desynchronising the parser
 * for the remainder of the file.
 *
 * A `;` outside a comment begins a rest-of-line comment, so the remainder of
 * the line must not be scanned for braces.
 */
function braceDepthAfter(line: string, depth: number): number {
  let current = depth;

  for (const char of line) {
    if (current === 0 && char === ";") break;
    if (char === "{") current += 1;
    else if (char === "}") current = Math.max(0, current - 1);
  }

  return current;
}

/**
 * Split a PGN file into its individual games.
 *
 * A new game begins at a tag pair that follows movetext. The brace-depth check
 * is what makes this safe on real files: annotated games routinely contain
 * multi-line comments, and a comment holding a line that merely looks like a
 * tag pair — `{ see [Event "..."] }` — would otherwise split one game in two
 * and corrupt both halves.
 *
 * Line endings are normalised and a leading byte order mark is removed, because
 * PGN files exported on Windows or by database software commonly carry both.
 *
 * Games are returned trimmed; blank stretches between games yield nothing.
 */
export function splitPgnGames(text: string): string[] {
  const normalised = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");

  const games: string[] = [];
  let current: string[] = [];
  let seenMovetext = false;
  let braceDepth = 0;

  const flush = () => {
    const game = current.join("\n").trim();
    if (game !== "") games.push(game);
    current = [];
    seenMovetext = false;
  };

  for (const line of normalised.split("\n")) {
    const startsNewGame =
      braceDepth === 0 && seenMovetext && isTagPairLine(line);

    if (startsNewGame) flush();

    current.push(line);

    if (braceDepth === 0 && line.trim() !== "" && !isTagPairLine(line)) {
      seenMovetext = true;
    }

    braceDepth = braceDepthAfter(line, braceDepth);
  }

  flush();

  return games;
}
