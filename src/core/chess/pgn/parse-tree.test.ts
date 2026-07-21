import { describe, expect, it } from "vitest";
import { mainline, parseGameTree } from "./parse-tree";
import { PgnParseError } from "./errors";
import { positionKeyFromFen } from "@/core/chess/position-key";

const ANNOTATED =
  '[Event "Club"]\n\n' +
  "1.d4 e6 2.Nf3 f5 {a note} 3.c4 $2 (3.g3 Nf6 {inside variation} 4.Bg2) 3...Nf6 *";

describe("parseGameTree", () => {
  it("returns the mainline in order", () => {
    const line = mainline(parseGameTree(ANNOTATED).root);
    expect(line.slice(1).map((n) => n.san)).toEqual([
      "d4",
      "e6",
      "Nf3",
      "f5",
      "c4",
      "Nf6",
    ]);
  });

  it("keeps comments attached to their move", () => {
    const line = mainline(parseGameTree(ANNOTATED).root);
    expect(line.find((n) => n.san === "f5")?.comments).toEqual(["a note"]);
  });

  it("keeps annotation glyphs", () => {
    const line = mainline(parseGameTree(ANNOTATED).root);
    expect(line.find((n) => n.san === "c4")?.nags).toEqual([2]);
  });

  it("keeps variations as additional children", () => {
    const line = mainline(parseGameTree(ANNOTATED).root);
    // After 2...f5 the game continues 3.c4, with 3.g3 given as an alternative.
    const beforeThird = line.find((n) => n.san === "f5");

    expect(beforeThird?.children.map((c) => c.san)).toEqual(["c4", "g3"]);
  });

  it("carries comments inside variations too", () => {
    const line = mainline(parseGameTree(ANNOTATED).root);
    const variation = line.find((n) => n.san === "f5")?.children[1];

    expect(variation?.san).toBe("g3");
    expect(variation?.children[0].comments).toEqual(["inside variation"]);
  });

  it("nests variations within variations", () => {
    const tree = parseGameTree("1.e4 e5 (1...c5 (1...e6 2.d4) 2.Nf3) 2.Nf3 *");
    const afterE4 = mainline(tree.root)[1];

    expect(afterE4.children.map((c) => c.san)).toEqual(["e5", "c5", "e6"]);
  });

  it("records headers without inventing absent ones", () => {
    // Both PGN libraries fill in the seven mandatory tags; storing those would
    // record values the source never contained.
    const tree = parseGameTree('[Event "Club"]\n\n1.e4 *');

    expect(tree.headers).toEqual({ Event: "Club" });
    expect(tree.headers).not.toHaveProperty("Site");
  });
});

describe("position identity", () => {
  it("matches keys derived independently", () => {
    // Positions, evaluations and notes are already stored under these keys.
    // Replaying through chess.js keeps them byte-identical to what import
    // produced before the parser changed.
    const tree = parseGameTree("1.e4 e5 *");
    const line = mainline(tree.root);

    expect(line[0].key).toBe(
      positionKeyFromFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),
    );
    expect(line[1].key).toBe(
      positionKeyFromFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"),
    );
  });

  it("gives every node a complete FEN", () => {
    const line = mainline(parseGameTree("1.e4 e5 *").root);
    expect(line[1].fen.split(" ")).toHaveLength(6);
  });

  it("records the move in UCI notation as well as SAN", () => {
    const line = mainline(parseGameTree("1.e4 e5 *").root);
    expect(line[1].uci).toBe("e2e4");
  });

  it("replays each variation from its own parent position", () => {
    // A sibling must not inherit the moves of the branch explored before it.
    const tree = parseGameTree("1.e4 e5 2.Nf3 (2.f4 exf4) (2.Bc4 Nf6) *");
    const afterE5 = mainline(tree.root)[2];

    const [mainNext, first, second] = afterE5.children;
    expect([mainNext.san, first.san, second.san]).toEqual(["Nf3", "f4", "Bc4"]);
    // Both alternatives start from the same position, so both are legal.
    expect(first.children[0].san).toBe("exf4");
    expect(second.children[0].san).toBe("Nf6");
  });
});

describe("set-up positions", () => {
  it("starts from the FEN header", () => {
    const tree = parseGameTree(
      '[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1.e4 *',
    );

    expect(tree.root.fen).toBe("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
    expect(mainline(tree.root)).toHaveLength(2);
  });

  it("rejects an invalid starting position", () => {
    expect(() =>
      parseGameTree('[FEN "not a position"]\n\n1.e4 *'),
    ).toThrow(PgnParseError);
  });
});

describe("damaged input", () => {
  it("throws when the mainline contains an illegal move", () => {
    expect(() => parseGameTree('[Event "A"]\n\n1.e4 e5 2.Kd8 *')).toThrow(
      PgnParseError,
    );
  });

  it("drops a broken variation but keeps the game", () => {
    // Source files do contain broken sidelines; losing the whole game to one
    // is a far worse outcome than losing the sideline.
    const tree = parseGameTree("1.e4 e5 2.Nf3 (2.Kd8 Qh4) 2...Nc6 *");

    expect(tree.droppedVariations).toBe(1);
    expect(mainline(tree.root).slice(1).map((n) => n.san)).toEqual([
      "e4",
      "e5",
      "Nf3",
      "Nc6",
    ]);
  });

  it("reports how many variations were dropped rather than hiding it", () => {
    const tree = parseGameTree("1.e4 (1.Kd8) e5 (1...Ke7) *");
    expect(tree.droppedVariations).toBe(2);
  });

  it("throws when there is no game at all", () => {
    expect(() => parseGameTree("")).toThrow(PgnParseError);
  });
});

describe("constructs the previous parser rejected", () => {
  // Each is valid PGN emitted by mainstream chess software, and each cost games
  // in a real collection.
  const cases: Record<string, string> = {
    "comment opening a variation": "1.e4 e5 2.Nf3 Nc6 ( {or} 2...d6 3.d4 ) 3.Bb5 *",
    "glyph opening a variation": "1.e4 e5 2.Nf3 Nc6 ( $1 2...d6 3.d4 ) 3.Bb5 *",
    "two consecutive comments": "1.e4 {first} {second} e5 *",
  };

  for (const [label, pgn] of Object.entries(cases)) {
    it(`parses ${label}`, () => {
      const line = mainline(parseGameTree(pgn).root);
      expect(line.length).toBeGreaterThan(1);
    });
  }

  it("keeps both of two consecutive comments", () => {
    const line = mainline(parseGameTree("1.e4 {first} {second} e5 *").root);
    expect(line[1].comments).toEqual(["first", "second"]);
  });

  it("keeps a comment that opens a variation", () => {
    const line = mainline(
      parseGameTree("1.e4 e5 2.Nf3 Nc6 ( {or} 2...d6 3.d4 ) 3.Bb5 *").root,
    );
    const alternative = line.find((n) => n.san === "Nf3")?.children[1];

    expect(alternative?.san).toBe("d6");
    expect(alternative?.comments).toContain("or");
  });
});
