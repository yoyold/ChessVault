/**
 * Longest comment rendered in full.
 *
 * Generous for genuine annotation — a long paragraph of prose fits — while
 * bounding what a damaged file can force into the DOM.
 */
export const MAX_COMMENT_LENGTH = 600;

export interface DisplayComment {
  text: string;
  /** Characters removed, or 0 when the comment is shown in full. */
  truncatedBy: number;
}

/**
 * Prepare a comment for display, bounding its length.
 *
 * Real files contain pathological comments. One collection held a comment that
 * had been re-encoded through the wrong character set repeatedly until a single
 * `ß` had grown into half a megabyte; rendering it made the page unresponsive.
 *
 * The cap is applied at display only. The comment is stored and parsed intact,
 * so nothing is lost and export still round-trips.
 */
export function toDisplayComment(comment: string): DisplayComment {
  const collapsed = comment.replace(/\s+/g, " ").trim();

  if (collapsed.length <= MAX_COMMENT_LENGTH) {
    return { text: collapsed, truncatedBy: 0 };
  }

  return {
    text: collapsed.slice(0, MAX_COMMENT_LENGTH),
    truncatedBy: collapsed.length - MAX_COMMENT_LENGTH,
  };
}
