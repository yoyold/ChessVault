import { describe, expect, it } from "vitest";
import {
  MOVE_SYMBOL_COLOR,
  symbolForMove,
  symbolForNag,
  symbolForQuality,
} from "./move-symbols";

describe("symbolForNag", () => {
  it("maps the six standard glyphs", () => {
    expect(symbolForNag(1)).toBe("!");
    expect(symbolForNag(2)).toBe("?");
    expect(symbolForNag(3)).toBe("!!");
    expect(symbolForNag(4)).toBe("??");
    expect(symbolForNag(5)).toBe("!?");
    expect(symbolForNag(6)).toBe("?!");
  });

  it("ignores glyphs that describe the position rather than the move", () => {
    // $14 is "White is slightly better" — marking the square with it would
    // claim something about the move that the glyph does not say.
    expect(symbolForNag(14)).toBeNull();
    expect(symbolForNag(18)).toBeNull();
  });
});

describe("symbolForQuality", () => {
  it("maps the engine's adverse verdicts", () => {
    expect(symbolForQuality("inaccuracy")).toBe("?!");
    expect(symbolForQuality("mistake")).toBe("?");
    expect(symbolForQuality("blunder")).toBe("??");
  });

  it("says nothing about an unremarkable move", () => {
    // A badge on every move is a badge on no move.
    expect(symbolForQuality("good")).toBeNull();
    expect(symbolForQuality("best")).toBeNull();
  });
});

describe("symbolForMove", () => {
  it("prefers the annotator's own glyph over the engine's verdict", () => {
    // Someone wrote "!?" deliberately; the verdict is derived and can be
    // recomputed. Overwriting the human judgement is the wrong way round.
    expect(symbolForMove([5], "blunder")).toBe("!?");
  });

  it("falls back to the engine when nothing was annotated", () => {
    expect(symbolForMove([], "mistake")).toBe("?");
  });

  it("skips positional glyphs to reach a move glyph", () => {
    // A move often carries both, e.g. "Nf3! ⩲".
    expect(symbolForMove([14, 1], undefined)).toBe("!");
  });

  it("shows nothing for a plain move", () => {
    expect(symbolForMove([], "good")).toBeNull();
    expect(symbolForMove([], undefined)).toBeNull();
    expect(symbolForMove([14], undefined)).toBeNull();
  });
});

describe("colours", () => {
  it("gives every symbol a colour", () => {
    for (const symbol of ["!!", "!", "!?", "?!", "?", "??"] as const) {
      expect(MOVE_SYMBOL_COLOR[symbol]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("distinguishes every symbol", () => {
    expect(new Set(Object.values(MOVE_SYMBOL_COLOR)).size).toBe(6);
  });
});
