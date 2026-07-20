import { buildSearchTokens } from "./search-tokens";

/**
 * Whether two PGN player names refer to the same person.
 *
 * Name formatting is not consistent across sources: the PGN standard asks for
 * `Last, First`, but exports from playing sites and scanned tournament files
 * regularly use `First Last`, omit the comma, or vary capitalisation and
 * accents. Comparing raw strings would fail to recognise the database owner in
 * a large share of their own games, leaving `playerColor` unset and silently
 * breaking every colour-based filter and statistic.
 *
 * Comparison is therefore on the *set* of name tokens, which makes it
 * insensitive to order, punctuation and case.
 *
 * The deliberate limitation is that this does not attempt fuzzy matching:
 * initials (`Carlsen, M.`) do not match a full first name, and misspellings do
 * not match at all. Guessing wrong here would misattribute games to the owner,
 * which corrupts statistics in a way that is hard to notice and harder to
 * unpick — a missed match is recoverable by adding another name in settings.
 */
export function isSamePlayer(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;

  const tokensA = buildSearchTokens(a);
  const tokensB = buildSearchTokens(b);

  if (tokensA.length === 0 || tokensA.length !== tokensB.length) return false;

  // buildSearchTokens returns sorted, deduplicated tokens, so element-wise
  // comparison is sufficient.
  return tokensA.every((token, index) => token === tokensB[index]);
}

/** Whether a name matches any of the configured identities of the database owner. */
export function matchesAnyPlayer(
  name: string | null | undefined,
  ownerNames: readonly string[],
): boolean {
  return ownerNames.some((owner) => isSamePlayer(name, owner));
}
