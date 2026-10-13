/**
 * The words of a player's name, for telling whether two names are the same.
 *
 * Splitting on non-alphanumeric characters is what makes `"Carlsen, Magnus"`
 * and `"Magnus Carlsen"` the same set of words, and Unicode-aware classes keep
 * names outside ASCII intact — `Ding` and `Đurić` must both split correctly.
 *
 * Single characters are dropped: an initial says too little to tell two
 * people apart, and keeping it would make `Carlsen, M.` differ from
 * `Carlsen, Magnus` by a letter rather than by a whole name.
 *
 * @returns Lowercased, deduplicated and sorted, so two names can be compared
 *   word by word.
 */
export function nameTokens(name: string | null | undefined): string[] {
  if (!name) return [];

  const tokens = new Set<string>();
  for (const token of name.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (token.length >= 2) tokens.add(token);
  }

  return [...tokens].sort();
}
