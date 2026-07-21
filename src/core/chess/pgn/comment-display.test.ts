import { describe, expect, it } from "vitest";
import { MAX_COMMENT_LENGTH, toDisplayComment } from "./comment-display";

describe("toDisplayComment", () => {
  it("returns a short comment unchanged", () => {
    expect(toDisplayComment("a good move")).toEqual({
      text: "a good move",
      truncatedBy: 0,
    });
  });

  it("collapses the line breaks PGN wrapping introduces", () => {
    // Exporters wrap comments mid-sentence; rendering that verbatim shows
    // ragged breaks that were never in the annotation.
    expect(toDisplayComment("a comment\nsplit over\nlines").text).toBe(
      "a comment split over lines",
    );
  });

  it("caps a pathologically long comment", () => {
    // A real collection held a comment that repeated mis-encoding had grown to
    // half a megabyte; rendering it made the page unresponsive.
    const huge = "x".repeat(500_000);
    const result = toDisplayComment(huge);

    expect(result.text).toHaveLength(MAX_COMMENT_LENGTH);
    expect(result.truncatedBy).toBe(500_000 - MAX_COMMENT_LENGTH);
  });

  it("reports how much was hidden rather than truncating silently", () => {
    const result = toDisplayComment("y".repeat(MAX_COMMENT_LENGTH + 25));
    expect(result.truncatedBy).toBe(25);
  });

  it("handles an empty comment", () => {
    expect(toDisplayComment("   ")).toEqual({ text: "", truncatedBy: 0 });
  });
});
