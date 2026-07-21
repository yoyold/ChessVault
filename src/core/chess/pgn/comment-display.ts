/**
 * Longest comment rendered in full.
 *
 * Generous for genuine annotation — a long paragraph of prose fits — while
 * bounding what a damaged file can force into the DOM.
 */
export const MAX_COMMENT_LENGTH = 600;

/**
 * Machine-readable commands embedded in comments, such as `[%eval 0.15]`,
 * `[%clk 0:04:32]` and `[%cal Gf1c4]`.
 *
 * The PGN specification reserves `[%name ...]` inside a comment for data aimed
 * at software rather than at the reader. Annotated exports are dense with them:
 * a game from an online site carries one per move, and rendering them turns the
 * move list into an unreadable wall of `[%eval …]`.
 *
 * They are removed from display only. The stored PGN keeps them, so the
 * evaluations and clock times remain available to features that want them.
 */
const EMBEDDED_COMMAND = /\[%[^\]]*\]/g;

export interface DisplayComment {
  text: string;
  /** Characters removed by the length cap, or 0 when shown in full. */
  truncatedBy: number;
}

/**
 * Prepare a comment for display: drop machine commands, bound the length.
 *
 * Real files contain pathological comments. One collection held a comment that
 * had been re-encoded through the wrong character set repeatedly until a single
 * `ß` had grown into half a megabyte; rendering it made the page unresponsive.
 *
 * Both transformations apply to display only. Comments are stored and parsed
 * intact, so nothing is lost and export still round-trips.
 */
export function toDisplayComment(comment: string): DisplayComment {
  const prose = comment.replace(EMBEDDED_COMMAND, " ").replace(/\s+/g, " ").trim();

  if (prose.length <= MAX_COMMENT_LENGTH) {
    return { text: prose, truncatedBy: 0 };
  }

  return {
    text: prose.slice(0, MAX_COMMENT_LENGTH),
    truncatedBy: prose.length - MAX_COMMENT_LENGTH,
  };
}

/** Whether a comment has anything to show once machine commands are removed. */
export function hasVisibleComment(comment: string): boolean {
  return toDisplayComment(comment).text.length > 0;
}
