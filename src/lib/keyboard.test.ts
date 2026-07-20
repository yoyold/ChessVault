import { describe, expect, it } from "vitest";
import { isTextEntryTarget, matchesCombo } from "./keyboard";

function keyEvent(
  overrides: Partial<Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">>,
) {
  return {
    key: "a",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  };
}

describe("matchesCombo", () => {
  it("matches a plain key", () => {
    expect(matchesCombo(keyEvent({ key: "k" }), "k")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(matchesCombo(keyEvent({ key: "K" }), "k")).toBe(true);
  });

  it("accepts either Command or Control for 'mod'", () => {
    // Declared once, native on every platform.
    expect(matchesCombo(keyEvent({ key: "k", metaKey: true }), "mod+k")).toBe(true);
    expect(matchesCombo(keyEvent({ key: "k", ctrlKey: true }), "mod+k")).toBe(true);
  });

  it("does not match when a required modifier is absent", () => {
    expect(matchesCombo(keyEvent({ key: "k" }), "mod+k")).toBe(false);
  });

  it("does not match when an extra modifier is held", () => {
    // Otherwise mod+shift+k would also trigger the mod+k command.
    expect(
      matchesCombo(keyEvent({ key: "k", metaKey: true, shiftKey: true }), "mod+k"),
    ).toBe(false);
  });

  it("matches combinations with several modifiers", () => {
    expect(
      matchesCombo(keyEvent({ key: "p", ctrlKey: true, shiftKey: true }), "mod+shift+p"),
    ).toBe(true);
  });
});

describe("isTextEntryTarget", () => {
  it("detects form fields", () => {
    // Single-key shortcuts must not fire while the user is typing.
    expect(isTextEntryTarget(document.createElement("input"))).toBe(true);
    expect(isTextEntryTarget(document.createElement("textarea"))).toBe(true);
    expect(isTextEntryTarget(document.createElement("select"))).toBe(true);
  });

  it("detects contenteditable elements", () => {
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    // jsdom does not derive isContentEditable from the attribute.
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(isTextEntryTarget(editable)).toBe(true);
  });

  it("ignores ordinary elements and null", () => {
    expect(isTextEntryTarget(document.createElement("div"))).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });
});
