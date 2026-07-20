/**
 * A PGN tag pair line, e.g. `[White "Carlsen, Magnus"]`.
 *
 * The value may contain escaped quotes and backslashes, which the PGN
 * specification requires to be written as `\"` and `\\`.
 */
const TAG_PAIR_LINE = /^\s*\[\s*([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/;

/** Whether a line is a well-formed tag pair. */
export function isTagPairLine(line: string): boolean {
  return TAG_PAIR_LINE.test(line);
}

function unescapeTagValue(value: string): string {
  return value.replace(/\\(["\\])/g, "$1");
}

/**
 * Extract the tag pairs of a single game, preserving every tag as written.
 *
 * Deliberately not delegated to chess.js: its header accessor injects defaults
 * for the seven mandatory tags, so a file that omitted `Site` comes back
 * carrying `"?"`, and one that omitted `Date` carries `"????.??.??"`. Storing
 * those would mean recording values the source never contained, which defeats
 * the purpose of keeping the headers as the lossless record.
 *
 * Parsing stops at the first line that is neither a tag pair nor blank, since
 * everything from there on is movetext.
 */
export function parseTagPairs(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const line of pgn.split("\n")) {
    const match = TAG_PAIR_LINE.exec(line);

    if (match) {
      headers[match[1]] = unescapeTagValue(match[2]);
      continue;
    }

    if (line.trim() === "") continue;

    break;
  }

  return headers;
}
