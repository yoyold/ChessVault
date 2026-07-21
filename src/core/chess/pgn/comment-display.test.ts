import { describe, expect, it } from "vitest";
import {
  hasVisibleComment,
  MAX_COMMENT_LENGTH,
  toDisplayComment,
} from "./comment-display";

describe("embedded machine commands", () => {
  // Annotated exports carry one of these per move. Rendered as prose they turn
  // the move list into a wall of `[%eval …]`.
  it("removes evaluation commands", () => {
    expect(toDisplayComment("[%eval 0.15]").text).toBe("");
  });

  it("removes clock commands", () => {
    expect(toDisplayComment("[%clk 0:04:32]").text).toBe("");
  });

  it("keeps the prose around a command", () => {
    expect(toDisplayComment("[%eval -0.44] a weak square").text).toBe(
      "a weak square",
    );
  });

  it("removes several commands from one comment", () => {
    expect(toDisplayComment("[%eval 0.3] [%clk 0:01:00] good").text).toBe("good");
  });

  it("reports a command-only comment as having nothing to show", () => {
    expect(hasVisibleComment("[%eval 0.15]")).toBe(false);
    expect(hasVisibleComment("[%eval 0.15] but risky")).toBe(true);
  });
});

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
