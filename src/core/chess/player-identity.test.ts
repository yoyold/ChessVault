import { describe, expect, it } from "vitest";
import { isSamePlayer, matchesAnyPlayer } from "./player-identity";

describe("isSamePlayer", () => {
  it("matches identical names", () => {
    expect(isSamePlayer("Carlsen, Magnus", "Carlsen, Magnus")).toBe(true);
  });

  it("ignores word order", () => {
    // The whole reason this exists: sources disagree on Last, First vs First
    // Last, and a raw comparison would leave the owner's own games unattributed.
    expect(isSamePlayer("Carlsen, Magnus", "Magnus Carlsen")).toBe(true);
  });

  it("ignores case and punctuation", () => {
    expect(isSamePlayer("CARLSEN, MAGNUS", "magnus carlsen")).toBe(true);
    expect(isSamePlayer("Dony,Lukas", "Dony, Lukas")).toBe(true);
  });

  it("matches names with non-ASCII letters", () => {
    expect(isSamePlayer("Đurić, Živko", "Živko Đurić")).toBe(true);
  });

  it("distinguishes different people", () => {
    expect(isSamePlayer("Carlsen, Magnus", "Caruana, Fabiano")).toBe(false);
  });

  it("does not match a subset of names", () => {
    // A missed match is recoverable; a wrong match silently corrupts stats, so
    // partial overlap must not count.
    expect(isSamePlayer("Carlsen, Magnus", "Carlsen")).toBe(false);
    expect(isSamePlayer("Carlsen, Magnus", "Carlsen, Magnus Oen")).toBe(false);
  });

  it("does not fuzzy-match initials", () => {
    expect(isSamePlayer("Carlsen, Magnus", "Carlsen, M")).toBe(false);
  });

  it("treats absent names as no match", () => {
    expect(isSamePlayer(null, "Carlsen")).toBe(false);
    expect(isSamePlayer("Carlsen", undefined)).toBe(false);
    expect(isSamePlayer("", "")).toBe(false);
  });
});

describe("matchesAnyPlayer", () => {
  const owner = ["Dony, Lukas", "LukasD"];

  it("matches any configured identity", () => {
    expect(matchesAnyPlayer("Lukas Dony", owner)).toBe(true);
    expect(matchesAnyPlayer("LukasD", owner)).toBe(true);
  });

  it("returns false when none match", () => {
    expect(matchesAnyPlayer("Someone Else", owner)).toBe(false);
  });

  it("returns false for an empty identity list", () => {
    expect(matchesAnyPlayer("Dony, Lukas", [])).toBe(false);
  });
});
