import { describe, expect, it } from "vitest";
import { parseGame } from "@/core/chess/pgn/parse-game";
import { projectGame } from "./project-game";

const NOW = 1_700_000_000_000;

/** The indexed metadata, which is what most of these assertions are about. */
function project(pgn: string, ownerNames: string[] = []) {
  return projectGame(pgn, parseGame(pgn), { ownerNames, now: NOW }).record;
}

/** Both halves of the split, for assertions about the stored text. */
function projectFull(pgn: string, ownerNames: string[] = []) {
  return projectGame(pgn, parseGame(pgn), { ownerNames, now: NOW });
}

describe("projectGame", () => {
  it("projects the standard headers", () => {
    const record = project(
      '[Event "Club"]\n[White "Carlsen, Magnus"]\n[Black "Nepomniachtchi, Ian"]\n' +
        '[Result "1-0"]\n[Date "2024.03.15"]\n[ECO "C20"]\n\n1. e4 e5 1-0',
    );

    expect(record).toMatchObject({
      event: "Club",
      white: "Carlsen, Magnus",
      result: "1-0",
      dateIso: "2024-03-15",
      eco: "C20",
      plyCount: 2,
    });
  });

  it("treats the PGN placeholder '?' as an absent value", () => {
    // Storing "?" would make it appear as a real tournament named "?" in
    // filters and grouping.
    const record = project('[Event "?"]\n[Site "?"]\n\n1. e4 *');
    expect(record.event).toBeNull();
    expect(record.site).toBeNull();
  });

  it("normalises a typographic draw result", () => {
    // Unmapped, this falls through to "*" and turns every such draw into an
    // unfinished game, skewing every win rate that counts it.
    const record = project('[Result "½-½"]\n\n1. e4 e5 1/2-1/2');
    expect(record.result).toBe("1/2-1/2");
  });

  it("falls back to '*' for an unrecognised result", () => {
    expect(project('[Result "banana"]\n\n1. e4 *').result).toBe("*");
    expect(project("1. e4 *").result).toBe("*");
  });

  describe("owner colour detection", () => {
    const pgn = '[White "Carlsen, Magnus"]\n[Black "Firouzja, Alireza"]\n\n1. e4 *';

    it("detects the owner as White", () => {
      expect(project(pgn, ["Carlsen, Magnus"]).playerColor).toBe("white");
    });

    it("detects the owner as Black", () => {
      expect(project(pgn, ["Firouzja, Alireza"]).playerColor).toBe("black");
    });

    it("matches regardless of name order and punctuation", () => {
      // Sources disagree on formatting; strict comparison would leave the
      // owner's own games unattributed and break every colour filter.
      expect(project(pgn, ["Magnus Carlsen"]).playerColor).toBe("white");
    });

    it("leaves games the owner did not play unattributed", () => {
      expect(project(pgn, ["Kasparov, Garry"]).playerColor).toBeNull();
      expect(project(pgn).playerColor).toBeNull();
    });

    it("resolves a game the owner played against themselves as White", () => {
      const selfPlay = '[White "Me"]\n[Black "Me"]\n\n1. e4 *';
      expect(project(selfPlay, ["Me"]).playerColor).toBe("white");
    });
  });

  it("builds search tokens across players, event and opening", () => {
    const record = project(
      '[White "Carlsen, Magnus"]\n[Event "Tata Steel"]\n\n1. e4 *',
    );
    expect(record.searchTokens).toContain("carlsen");
    expect(record.searchTokens).toContain("tata");
  });

  it("keeps the original PGN and headers verbatim", () => {
    const pgn = '[Event "Club"]\n[WhiteElo "2830"]\n\n1. e4 *';
    const { content } = projectFull(pgn);
    expect(content.pgn).toBe(pgn);
    expect(content.headers.WhiteElo).toBe("2830");
    // Absent mandatory tags must not be invented.
    expect(content.headers).not.toHaveProperty("Site");
  });

  it("keeps the text out of the indexed metadata", () => {
    // The split is what keeps filtering cheap; text leaking back into the
    // metadata record would silently undo it.
    const record = project('[Event "Club"]\n\n1. e4 *');
    expect(record).not.toHaveProperty("pgn");
    expect(record).not.toHaveProperty("headers");
  });
});
