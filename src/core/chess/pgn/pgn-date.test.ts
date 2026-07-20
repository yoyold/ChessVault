import { describe, expect, it } from "vitest";
import { normalisePgnDate } from "./pgn-date";

describe("normalisePgnDate", () => {
  it("converts a complete date", () => {
    expect(normalisePgnDate("2024.03.15")).toBe("2024-03-15");
  });

  it("zero-pads single-digit components", () => {
    expect(normalisePgnDate("2024.3.5")).toBe("2024-03-05");
  });

  it("fills unknown month and day", () => {
    // Year-only dates are common in tournament archives.
    expect(normalisePgnDate("2024.??.??")).toBe("2024-01-01");
  });

  it("returns null when the year is unknown", () => {
    // A fabricated year would sort into a real range and quietly corrupt any
    // date filter, so an unusable date must stay absent rather than be guessed.
    expect(normalisePgnDate("????.??.??")).toBeNull();
    expect(normalisePgnDate("")).toBeNull();
    expect(normalisePgnDate(null)).toBeNull();
    expect(normalisePgnDate(undefined)).toBeNull();
  });

  it("accepts dash separators", () => {
    expect(normalisePgnDate("2024-03-15")).toBe("2024-03-15");
  });

  it("falls back for out-of-range components", () => {
    expect(normalisePgnDate("2024.13.40")).toBe("2024-01-01");
    expect(normalisePgnDate("2024.00.00")).toBe("2024-01-01");
  });

  it("produces lexicographically sortable output", () => {
    // The whole point of the projection: plain string ordering must match
    // chronological ordering, since that is what the index range-queries on.
    const dates = ["2024.10.01", "2024.02.28", "2023.12.31"]
      .map((d) => normalisePgnDate(d))
      .sort();
    expect(dates).toEqual(["2023-12-31", "2024-02-28", "2024-10-01"]);
  });
});
