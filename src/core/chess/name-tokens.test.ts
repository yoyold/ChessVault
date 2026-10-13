import { describe, expect, it } from "vitest";
import { nameTokens } from "./name-tokens";

describe("nameTokens", () => {
  it("splits a name into its words", () => {
    expect(nameTokens("Carlsen, Magnus")).toEqual(["carlsen", "magnus"]);
  });

  it("ignores case", () => {
    expect(nameTokens("CARLSEN Magnus")).toEqual(["carlsen", "magnus"]);
  });

  it("removes repeated words", () => {
    expect(nameTokens("Berlin Berlin")).toEqual(["berlin"]);
  });

  it("keeps non-ASCII letters intact", () => {
    // Splitting on a non-Unicode-aware class would shred these names into
    // fragments that no longer identify anyone.
    expect(nameTokens("Đurić, Živko")).toEqual(["đurić", "živko"]);
  });

  it("drops single characters", () => {
    expect(nameTokens("A B Nakamura")).toEqual(["nakamura"]);
  });

  it("is sorted, so word order does not matter", () => {
    expect(nameTokens("zeta alpha")).toEqual(nameTokens("Alpha, Zeta"));
  });

  it("returns nothing for an empty name", () => {
    expect(nameTokens(null)).toEqual([]);
    expect(nameTokens(undefined)).toEqual([]);
    expect(nameTokens("  ")).toEqual([]);
  });
});
