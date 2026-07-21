/**
 * Raised when a game cannot be parsed.
 *
 * Its own module so that both the tree parser and the import projection can
 * throw and catch it without importing each other.
 *
 * Import collects these per game rather than aborting: collections assembled
 * over years routinely contain a few damaged entries, and an all-or-nothing
 * import would make the whole file unusable.
 */
export class PgnParseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PgnParseError";
  }
}
