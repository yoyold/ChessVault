import { describe, expect, it } from "vitest";
import { parseGame, PgnParseError } from "./parse-game";
import { positionKeyFromFen } from "@/core/chess/position-key";

const SIMPLE = '[Event "Club"]\n[White "A"]\n[Black "B"]\n\n1. e4 e5 2. Nf3 Nc6 1-0';

describe("parseGame", () => {
  it("extracts headers, moves and ply count", () => {
    const game = parseGame(SIMPLE);
    expect(game.headers.Event).toBe("Club");
    expect(game.sanMoves).toEqual(["e4", "e5", "Nf3", "Nc6"]);
    expect(game.plyCount).toBe(4);
  });

  it("records one position per ply plus the starting position", () => {
    const game = parseGame(SIMPLE);
    expect(game.positions).toHaveLength(5);
    expect(game.positions[0]).toMatchObject({ ply: 0, san: null });
    expect(game.positions[4]).toMatchObject({ ply: 4, san: "Nc6" });
  });

  it("produces position keys that match those derived independently", () => {
    // Guards the fast path: keys are cut out of chess.js history FENs rather
    // than recomputed, so they must equal what full normalisation would give.
    const game = parseGame(SIMPLE);
    const startKey = positionKeyFromFen(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    );
    expect(game.positions[0].key).toBe(startKey);
  });

  it("keeps the mainline when the game contains variations", () => {
    const withVariation = '[Event "A"]\n\n1. e4 e5 2. Nf3 (2. f4 exf4) Nc6 *';
    expect(parseGame(withVariation).sanMoves).toEqual(["e4", "e5", "Nf3", "Nc6"]);
  });

  it("parses games carrying comments and annotation glyphs", () => {
    const annotated = '[Event "A"]\n\n1. e4! {best by test} e5 $1 2. Nf3 *';
    expect(parseGame(annotated).sanMoves).toEqual(["e4", "e5", "Nf3"]);
  });

  it("handles a game with no moves", () => {
    // Result-only stubs are common in exported collections and must not throw.
    const stub = '[Event "A"]\n[Result "1-0"]\n\n1-0';
    const game = parseGame(stub);
    expect(game.plyCount).toBe(0);
    expect(game.sanMoves).toEqual([]);
    // Only the starting position exists, and it is also the final one.
    expect(game.positions).toHaveLength(1);
    expect(game.finalFen).toBe(game.positions[0].key + " 0 1");
  });

  it("starts from the given FEN for a set-up position", () => {
    const setup =
      '[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 *';
    const game = parseGame(setup);
    expect(game.positions[0].key).toBe(positionKeyFromFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"));
    expect(game.plyCount).toBe(1);
  });

  it("reports the final position", () => {
    const game = parseGame(SIMPLE);
    expect(game.finalFen).toContain("w KQkq");
    expect(game.finalFen.split(" ")).toHaveLength(6);
  });

  it("throws PgnParseError on an illegal move rather than a generic error", () => {
    // One malformed game in a large file must be reportable and skippable
    // without aborting the whole import.
    expect(() => parseGame('[Event "A"]\n\n1. e4 e5 2. Kd8 *')).toThrow(
      PgnParseError,
    );
  });
});
