import { describe, expect, it } from "vitest";
import { splitPgnGames } from "./split-pgn";

const GAME_A = '[Event "A"]\n[White "One"]\n\n1. e4 e5 1-0';
const GAME_B = '[Event "B"]\n[White "Two"]\n\n1. d4 d5 0-1';

describe("splitPgnGames", () => {
  it("splits a multi-game file", () => {
    expect(splitPgnGames(`${GAME_A}\n\n${GAME_B}\n`)).toEqual([GAME_A, GAME_B]);
  });

  it("returns a single game unchanged", () => {
    expect(splitPgnGames(GAME_A)).toEqual([GAME_A]);
  });

  it("returns nothing for empty or whitespace-only input", () => {
    expect(splitPgnGames("")).toEqual([]);
    expect(splitPgnGames("\n\n   \n")).toEqual([]);
  });

  it("normalises Windows line endings", () => {
    const crlf = `${GAME_A}\r\n\r\n${GAME_B}`.replace(/\n/g, "\r\n");
    expect(splitPgnGames(crlf)).toEqual([GAME_A, GAME_B]);
  });

  it("strips a leading byte order mark", () => {
    // Exported files routinely carry one; left in place it would corrupt the
    // first tag pair and lose the first game's headers.
    const result = splitPgnGames(`${"\uFEFF"}${GAME_A}`);
    expect(result).toEqual([GAME_A]);
  });

  it("does not split on a tag pair inside a comment", () => {
    // The reason the splitter tracks brace depth rather than scanning lines
    // independently: a comment mentioning a tag pair would otherwise cut one
    // game in half and corrupt both pieces.
    const annotated = '[Event "A"]\n\n1. e4 { compare [Event "Other"] here } e5 1-0';
    expect(splitPgnGames(annotated)).toEqual([annotated]);
  });

  it("does not split on a tag pair inside a multi-line comment", () => {
    const annotated =
      '[Event "A"]\n\n1. e4 { a note\n[Event "Other"]\nstill the note } e5 1-0';
    expect(splitPgnGames(annotated)).toEqual([annotated]);
  });

  it("handles games with no blank line between them", () => {
    const packed = `${GAME_A}\n${GAME_B}`;
    expect(splitPgnGames(packed)).toEqual([GAME_A, GAME_B]);
  });

  it("keeps movetext-only input as one game", () => {
    // Headerless games appear in clipboard pastes and puzzle collections.
    expect(splitPgnGames("1. e4 e5 2. Nf3 *")).toEqual(["1. e4 e5 2. Nf3 *"]);
  });

  it("ignores a brace inside a rest-of-line comment", () => {
    // `;` comments run to end of line, so a brace in one must not open a
    // comment and swallow the rest of the file.
    const input = '[Event "A"]\n\n1. e4 ; note with { brace\ne5 1-0';
    expect(splitPgnGames(`${input}\n\n${GAME_B}`)).toEqual([input, GAME_B]);
  });
});
