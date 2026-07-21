import { describe, expect, it } from "vitest";
import { mainline, parseGameTree, type TreeNode } from "./parse-tree";
import { writePgn } from "./write-pgn";

function reparse(pgn: string) {
  const tree = parseGameTree(pgn);
  return writePgn(tree.headers, tree.root);
}

/** Compare the parts of a tree that carry meaning, ignoring derived fields. */
function shape(node: TreeNode): unknown {
  return {
    san: node.san,
    nags: node.nags,
    comments: node.comments,
    children: node.children.map(shape),
  };
}

describe("writePgn", () => {
  it("writes tag pairs and movetext", () => {
    const tree = parseGameTree('[Event "Club"]\n[Result "1-0"]\n\n1.e4 e5 1-0');
    const pgn = writePgn(tree.headers, tree.root);

    expect(pgn).toContain('[Event "Club"]');
    expect(pgn).toContain("1. e4 e5");
    expect(pgn.trimEnd().endsWith("1-0")).toBe(true);
  });

  it("writes the seven standard tags first", () => {
    // Not required by readers, but it makes a re-exported game look like any
    // other, and keeps a diff between two versions to what actually changed.
    const tree = parseGameTree(
      '[ECO "C20"]\n[White "A"]\n[Event "Club"]\n\n1.e4 *',
    );
    const lines = writePgn(tree.headers, tree.root).split("\n");

    expect(lines[0]).toContain("Event");
    expect(lines.findIndex((l) => l.includes("ECO"))).toBeGreaterThan(
      lines.findIndex((l) => l.includes("White")),
    );
  });

  it("escapes quotes and backslashes in tag values", () => {
    const tree = parseGameTree('[Event "A"]\n\n1.e4 *');
    const pgn = writePgn({ ...tree.headers, Event: 'The "Big" Open' }, tree.root);

    expect(pgn).toContain('[Event "The \\"Big\\" Open"]');
  });

  it("terminates the movetext with the result", () => {
    // Without it, readers treat the game as unfinished whatever the tag says.
    const tree = parseGameTree('[Result "0-1"]\n\n1.e4 e5 0-1');
    expect(writePgn(tree.headers, tree.root).trimEnd().endsWith("0-1")).toBe(true);
  });
});

describe("move numbering", () => {
  it("numbers White's moves and leaves Black's implicit", () => {
    const tree = parseGameTree("1.e4 e5 2.Nf3 Nc6 *");
    expect(writePgn(tree.headers, tree.root)).toContain("1. e4 e5 2. Nf3 Nc6");
  });

  it("restates the number for Black after a comment", () => {
    // `Nf6` alone after a comment is ambiguous about which move it is.
    const tree = parseGameTree("1.e4 {a note} e5 *");
    expect(writePgn(tree.headers, tree.root)).toContain("1... e5");
  });

  it("restates the number for Black after a variation", () => {
    const tree = parseGameTree("1.e4 (1.d4 d5) e5 *");
    expect(writePgn(tree.headers, tree.root)).toContain("1... e5");
  });

  it("numbers a variation's first move even when Black starts it", () => {
    const tree = parseGameTree("1.e4 e5 (1...c5 2.Nf3) 2.Nf3 *");
    expect(writePgn(tree.headers, tree.root)).toContain("(1... c5");
  });

  it("keeps real move numbers for a game from a set-up position", () => {
    // Numbering comes from the position, not from tree depth, so a game
    // starting mid-game does not restart at move one.
    const tree = parseGameTree(
      '[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 20"]\n\n20.e4 *',
    );
    expect(writePgn(tree.headers, tree.root)).toContain("20. e4");
  });
});

/**
 * The property everything else depends on.
 *
 * Editing works by changing the tree and writing it back. If writing and
 * parsing disagree, an edit silently loses annotations — the kind of loss a
 * user only notices much later, with no way to recover it.
 */
describe("round trip", () => {
  const cases: Record<string, string> = {
    "plain game": '[Event "A"]\n[Result "1-0"]\n\n1.e4 e5 2.Nf3 Nc6 1-0',
    "with comments": '[Event "A"]\n\n1.e4 {best by test} e5 {solid} 2.Nf3 *',
    "with glyphs": '[Event "A"]\n\n1.e4 $1 e5 $6 2.Nf3 $14 *',
    "with a variation": '[Event "A"]\n\n1.e4 e5 (1...c5 2.Nf3 d6) 2.Nf3 *',
    "with nested variations":
      '[Event "A"]\n\n1.e4 e5 (1...c5 (1...e6 2.d4) 2.Nf3) 2.Nf3 *',
    "with several variations on one move":
      '[Event "A"]\n\n1.e4 e5 2.Nf3 (2.f4 exf4) (2.Bc4 Nf6) 2...Nc6 *',
    "comments inside variations":
      '[Event "A"]\n\n1.e4 e5 (1...c5 {Sicilian} 2.Nf3) 2.Nf3 *',
    "glyphs and comments together":
      '[Event "A"]\n\n1.e4 $1 {strong} e5 (1...c5 $5 {sharp}) 2.Nf3 *',
    "set-up position":
      '[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 20"]\n\n20.e4 Kd7 *',
  };

  for (const [label, pgn] of Object.entries(cases)) {
    it(`preserves ${label}`, () => {
      const original = parseGameTree(pgn);
      const rewritten = parseGameTree(writePgn(original.headers, original.root));

      expect(shape(rewritten.root)).toEqual(shape(original.root));
    });
  }

  it("is stable across repeated writes", () => {
    // An edit-save cycle must not drift the file a little each time.
    const pgn = '[Event "A"]\n\n1.e4 $1 {note} e5 (1...c5 2.Nf3) 2.Nf3 *';
    const once = reparse(pgn);

    expect(reparse(once)).toBe(once);
  });

  it("preserves the mainline moves exactly", () => {
    const pgn = "1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 (3...d5 4.cxd5) 4.e3 *";
    const original = mainline(parseGameTree(pgn).root).map((n) => n.san);

    const tree = parseGameTree(pgn);
    const rewritten = mainline(parseGameTree(writePgn(tree.headers, tree.root)).root);

    expect(rewritten.map((n) => n.san)).toEqual(original);
  });
});

describe("line wrapping", () => {
  it("wraps long movetext without breaking a token", () => {
    const moves = Array.from({ length: 40 }, (_, i) => `${i + 1}.Nf3 Ng8 ${i + 1}...Nf6 Ng1`)
      .join(" ");
    void moves;

    const tree = parseGameTree(
      "1.Nf3 Nf6 2.Ng1 Ng8 3.Nf3 Nf6 4.Ng1 Ng8 5.Nf3 Nf6 6.Ng1 Ng8 7.Nf3 Nf6 8.Ng1 Ng8 *",
    );
    const lines = writePgn(tree.headers, tree.root).split("\n");

    for (const line of lines) expect(line.length).toBeLessThanOrEqual(80);
  });
});
