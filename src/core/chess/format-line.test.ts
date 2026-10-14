import { describe, expect, it } from "vitest";
import { formatLine } from "./format-line";

describe("formatLine", () => {
  it("numbers White's moves", () => {
    expect(formatLine(["e4", "c5", "Nf3"])).toBe("1. e4 c5 2. Nf3");
  });

  it("is empty for the starting position", () => {
    expect(formatLine([])).toBe("");
  });
});
