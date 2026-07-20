/**
 * Build the token list backing game search.
 *
 * IndexedDB offers no full-text search. Indexing these tokens with a
 * multi-entry index turns a search into a real index lookup rather than a scan
 * over every record, which is what keeps search interactive at the collection
 * sizes this project targets.
 *
 * Splitting on non-alphanumeric characters is what makes `"Carlsen, Magnus"`
 * findable by either name, and Unicode-aware classes keep names outside ASCII
 * intact — `Ding` and `Đurić` must both tokenise correctly.
 *
 * Single characters are dropped: they match nearly everything and would bloat
 * the index for no discriminating power.
 */
export function buildSearchTokens(
  ...values: (string | null | undefined)[]
): string[] {
  const tokens = new Set<string>();

  for (const value of values) {
    if (!value) continue;

    for (const token of value.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      if (token.length >= 2) tokens.add(token);
    }
  }

  // Sorted so the stored array is stable: an unchanged game re-imported or
  // re-projected produces an identical record, which keeps diffs and
  // equality checks meaningful.
  return [...tokens].sort();
}
