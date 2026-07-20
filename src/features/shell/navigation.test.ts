import { describe, expect, it } from "vitest";
import { isActivePath, NAV_ITEMS } from "./navigation";

describe("isActivePath", () => {
  it("matches the root only exactly", () => {
    // Without the special case, every path would match the root and two
    // entries would appear active at once.
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/", "/games")).toBe(false);
  });

  it("matches a section and its sub-paths", () => {
    expect(isActivePath("/games", "/games")).toBe(true);
    expect(isActivePath("/games", "/games/import")).toBe(true);
  });

  it("does not match a different section sharing a prefix", () => {
    expect(isActivePath("/games", "/gameshow")).toBe(false);
  });
});

describe("NAV_ITEMS", () => {
  it("has unique hrefs", () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("links only to routes that exist", () => {
    // Guards the promise the navigation makes: an entry marked available must
    // have a real page behind it, never an empty placeholder.
    const available = NAV_ITEMS.filter((item) => item.available).map((i) => i.href);
    expect(available).toEqual(["/", "/settings"]);
  });
});
