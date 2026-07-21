import type { TreeNode } from "./parse-tree";

/**
 * Tag pairs written first, in the order the PGN standard specifies.
 *
 * Readers do not require this order, but writing it consistently means a game
 * exported from here looks like one exported from anywhere else, and a diff
 * between two versions of the same game shows only what actually changed.
 */
const SEVEN_TAG_ROSTER = [
  "Event",
  "Site",
  "Date",
  "Round",
  "White",
  "Black",
  "Result",
] as const;

/** Escape a tag value: the standard requires quotes and backslashes escaped. */
function escapeTagValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function writeHeaders(headers: Record<string, string>): string {
  const written = new Set<string>();
  const lines: string[] = [];

  for (const tag of SEVEN_TAG_ROSTER) {
    const value = headers[tag];
    if (value === undefined) continue;

    lines.push(`[${tag} "${escapeTagValue(value)}"]`);
    written.add(tag);
  }

  for (const [tag, value] of Object.entries(headers)) {
    if (written.has(tag)) continue;

    lines.push(`[${tag} "${escapeTagValue(value)}"]`);
  }

  return lines.join("\n");
}

/** The fullmove number recorded in a FEN. */
function fullmoveOf(fen: string): number {
  const parsed = Number(fen.split(" ")[5]);

  return Number.isFinite(parsed) ? parsed : 1;
}

/**
 * Serialise a move and everything attached to it.
 *
 * @param forceNumber Whether the move number must be written even for Black.
 *   Required after anything that interrupts the sequence — a comment, a
 *   variation, or the start of a line — because `Nf6` alone would otherwise be
 *   ambiguous about which move it is.
 */
function writeMove(parent: TreeNode, node: TreeNode, forceNumber: boolean): string {
  const parts: string[] = [];

  // Numbering is taken from the position the move was played in, not from the
  // node's depth, so a game starting from a set-up position keeps its real move
  // numbers instead of restarting at one.
  const moveNumber = fullmoveOf(parent.fen);

  if (parent.sideToMove === "w") parts.push(`${moveNumber}.`);
  else if (forceNumber) parts.push(`${moveNumber}...`);

  parts.push(node.san as string);

  for (const nag of node.nags) parts.push(`$${nag}`);

  for (const comment of node.comments) parts.push(`{${comment}}`);

  return parts.join(" ");
}

/**
 * Serialise a line and its variations, starting from `node`'s children.
 *
 * Variations are written in parentheses immediately after the move they
 * replace, which is where a reader expects them and where re-parsing will
 * attach them to the same move again.
 */
function writeLine(parent: TreeNode, forceFirstNumber: boolean): string[] {
  const tokens: string[] = [];

  let current = parent;
  let force = forceFirstNumber;

  while (current.children.length > 0) {
    const [mainline, ...alternatives] = current.children;

    tokens.push(writeMove(current, mainline, force));

    for (const alternative of alternatives) {
      // Each variation starts a fresh sequence, so its first move always
      // carries a number.
      const inner = [writeMove(current, alternative, true), ...writeLine(alternative, false)];
      tokens.push(`(${inner.join(" ")})`);
    }

    // A comment or a variation interrupts the flow, so the next Black move has
    // to restate its number.
    force = alternatives.length > 0 || mainline.comments.length > 0;

    current = mainline;
  }

  return tokens;
}

/**
 * Wrap movetext at a column limit, as PGN exporters conventionally do.
 *
 * Never breaks inside a token, so a variation or a comment stays intact.
 */
function wrap(tokens: string[], limit = 80): string {
  const lines: string[] = [];
  let line = "";

  for (const token of tokens) {
    if (line === "") line = token;
    else if (line.length + 1 + token.length <= limit) line += ` ${token}`;
    else {
      lines.push(line);
      line = token;
    }
  }

  if (line !== "") lines.push(line);

  return lines.join("\n");
}

/**
 * Write a game back to PGN.
 *
 * Editing works by changing the tree and writing it back, so this is the
 * counterpart to parsing and the two must agree: anything this emits has to
 * re-parse into the same tree, or an edit would quietly lose annotations.
 * `write-pgn.test.ts` asserts that round trip directly.
 */
export function writePgn(headers: Record<string, string>, root: TreeNode): string {
  const tokens = writeLine(root, true);

  // The result terminates the movetext. Absent, readers treat the game as
  // unfinished regardless of what the Result tag says.
  const result = headers.Result ?? "*";
  tokens.push(result);

  const movetext = wrap(tokens);

  const preamble = root.comments.length > 0
    ? `${root.comments.map((comment) => `{${comment}}`).join(" ")}\n`
    : "";

  return `${writeHeaders(headers)}\n\n${preamble}${movetext}\n`;
}
