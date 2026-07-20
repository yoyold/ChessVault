/**
 * A stable fingerprint of a game's PGN text, used to recognise re-imports.
 *
 * Re-importing the same file — a routine action when a collection is updated
 * incrementally — must not duplicate games. Comparing full PGN text of every
 * candidate against every stored game is quadratic; an indexed hash reduces it
 * to a lookup.
 *
 * The hash is a fingerprint, not a proof: callers must compare the actual PGN
 * text of the candidates a lookup returns. That comparison is what makes the
 * non-cryptographic hash acceptable here — a collision costs one extra string
 * comparison, never a wrongly discarded game.
 *
 * Whitespace is collapsed before hashing because exporters wrap movetext at
 * different column widths. Two byte-different files describing the same game
 * would otherwise both import, which is precisely the duplicate this is meant
 * to prevent. Annotations and comments are *not* stripped: a re-annotated game
 * is genuinely different content and should not silently replace the original.
 */
export function gameContentHash(pgn: string): string {
  const normalised = pgn.replace(/\s+/g, " ").trim();

  // Two FNV-1a passes with different offset bases, concatenated. A single
  // 32-bit hash would collide often enough across tens of thousands of games to
  // make the fallback comparison a routine cost rather than a rare one.
  const low = fnv1a(normalised, 0x811c9dc5);
  const high = fnv1a(normalised, 0x01000193);

  return high.toString(16).padStart(8, "0") + low.toString(16).padStart(8, "0");
}

/** FNV-1a, 32-bit. Chosen for being short, dependency-free and well distributed over text. */
function fnv1a(text: string, offsetBasis: number): number {
  let hash = offsetBasis;

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    // hash * 16777619 via shifts, keeping the result in 32-bit range.
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    hash >>>= 0;
  }

  return hash >>> 0;
}
