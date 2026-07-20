import { describe, expect, it } from "vitest";
import { buildSearchTokens } from "./search-tokens";

describe("buildSearchTokens", () => {
  it("splits a name into independently searchable tokens", () => {
    // Finding a player by surname alone is the common case.
    expect(buildSearchTokens("Carlsen, Magnus")).toEqual(["carlsen", "magnus"]);
  });

  it("lowercases so search is case-insensitive", () => {
    expect(buildSearchTokens("PARIS Open")).toEqual(["open", "paris"]);
  });

  it("merges several fields and removes duplicates", () => {
    const tokens = buildSearchTokens("Berlin Open", "Berlin", null, undefined);
    expect(tokens).toEqual(["berlin", "open"]);
  });

  it("keeps non-ASCII letters intact", () => {
    // Splitting on a non-Unicode-aware class would shred these names into
    // fragments and make the players unfindable.
    expect(buildSearchTokens("Đurić, Živko")).toEqual(["đurić", "živko"]);
  });

  it("drops single characters", () => {
    // They match almost everything and add index weight without discriminating.
    expect(buildSearchTokens("A B Nakamura")).toEqual(["nakamura"]);
  });

  it("returns a stable, sorted array", () => {
    // Stability keeps an unchanged game byte-identical when re-projected.
    expect(buildSearchTokens("zeta alpha")).toEqual(["alpha", "zeta"]);
  });

  it("returns nothing for empty input", () => {
    expect(buildSearchTokens(null, undefined, "", "  ")).toEqual([]);
  });
});
