import { describe, expect, it } from "vitest";
import { parseTagPairs } from "./tag-pairs";

describe("parseTagPairs", () => {
  it("reads tag pairs into a record", () => {
    const headers = parseTagPairs('[Event "Club Night"]\n[Round "3"]\n\n1. e4 *');
    expect(headers).toEqual({ Event: "Club Night", Round: "3" });
  });

  it("records only tags the file actually contains", () => {
    // The reason this is not delegated to chess.js: its header accessor fills
    // in the mandatory seven, so absent tags would come back as "?" and
    // "????.??.??" and be stored as though the source had provided them.
    const headers = parseTagPairs('[White "A"]\n\n1. e4 *');
    expect(headers).toEqual({ White: "A" });
    expect(headers).not.toHaveProperty("Site");
    expect(headers).not.toHaveProperty("Date");
  });

  it("preserves non-standard tags", () => {
    const headers = parseTagPairs('[WhiteElo "2830"]\n[Annotator "Kasparov"]\n\n*');
    expect(headers.WhiteElo).toBe("2830");
    expect(headers.Annotator).toBe("Kasparov");
  });

  it("unescapes quotes and backslashes in values", () => {
    const headers = parseTagPairs('[Event "The \\"Big\\" Open"]\n\n*');
    expect(headers.Event).toBe('The "Big" Open');
  });

  it("stops at the movetext", () => {
    // A tag-pair-looking line inside movetext must not be picked up as a header.
    const headers = parseTagPairs('[Event "A"]\n\n1. e4 { [Event "B"] } *');
    expect(headers).toEqual({ Event: "A" });
  });

  it("returns an empty record for a headerless game", () => {
    expect(parseTagPairs("1. e4 e5 *")).toEqual({});
  });
});
