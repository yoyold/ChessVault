/**
 * A line of moves from the starting position as it is written: "1. e4 c5 2. Nf3".
 *
 * Only for lines that start at the initial position, with White to move.
 */
export function formatLine(line: readonly string[]): string {
  return line
    .map((san, ply) => (ply % 2 === 0 ? `${ply / 2 + 1}. ${san}` : san))
    .join(" ");
}
