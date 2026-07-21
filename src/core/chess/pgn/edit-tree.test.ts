import { describe, expect, it } from "vitest";
import { mainline, parseGameTree } from "./parse-tree";
import { nodeAtPath } from "./tree-path";
import {
  addMove,
  pathAfterPromotion,
  promoteVariation,
  removeNode,
  withComments,
  withNags,
} from "./edit-tree";
import { writePgn } from "./write-pgn";

const GAME = "1.e4 e5 2.Nf3 Nc6 *";
const tree = () => parseGameTree(GAME);

describe("withComments", () => {
  it("attaches a comment to a move", () => {
    const root = withComments(tree().root, [0], ["a strong start"]);
    expect(nodeAtPath(root, [0]).comments).toEqual(["a strong start"]);
  });

  it("replaces existing comments rather than appending", () => {
    const once = withComments(tree().root, [0], ["first"]);
    const twice = withComments(once, [0], ["second"]);

    expect(nodeAtPath(twice, [0]).comments).toEqual(["second"]);
  });

  it("drops blank comments", () => {
    // An empty comment writes `{}` into the file, which nobody meant to add.
    const root = withComments(tree().root, [0], ["  ", "kept", ""]);
    expect(nodeAtPath(root, [0]).comments).toEqual(["kept"]);
  });

  it("leaves the original tree untouched", () => {
    // React compares by reference; mutating in place would leave the view stale.
    const original = tree().root;
    withComments(original, [0], ["note"]);

    expect(original.children[0].comments).toEqual([]);
  });
});

describe("withNags", () => {
  it("sets glyphs on a move", () => {
    const root = withNags(tree().root, [0], [1]);
    expect(nodeAtPath(root, [0]).nags).toEqual([1]);
  });

  it("removes duplicates", () => {
    const root = withNags(tree().root, [0], [1, 1, 3]);
    expect(nodeAtPath(root, [0]).nags).toEqual([1, 3]);
  });

  it("clears glyphs when given an empty set", () => {
    const marked = withNags(tree().root, [0], [2]);
    expect(nodeAtPath(withNags(marked, [0], []), [0]).nags).toEqual([]);
  });
});

describe("addMove", () => {
  it("continues a line at its end", () => {
    const end = [0, 0, 0, 0];
    const result = addMove(tree().root, end, "Bb5");

    expect(result?.added).toBe(true);
    expect(mainline(result!.root).at(-1)?.san).toBe("Bb5");
  });

  it("adds an alternative to a move that already has a continuation", () => {
    // After 1.e4 e5 the game continues 2.Nf3; adding 2.Bc4 is a variation.
    const result = addMove(tree().root, [0, 0], "Bc4");

    expect(result?.added).toBe(true);
    expect(nodeAtPath(result!.root, [0, 0]).children.map((c) => c.san)).toEqual([
      "Nf3",
      "Bc4",
    ]);
  });

  it("navigates to an existing move instead of duplicating it", () => {
    // Walking into a variation written earlier must not add a second copy.
    const result = addMove(tree().root, [0, 0], "Nf3");

    expect(result?.added).toBe(false);
    expect(result?.path).toEqual([0, 0, 0]);
    expect(nodeAtPath(result!.root, [0, 0]).children).toHaveLength(1);
  });

  it("refuses an illegal move", () => {
    expect(addMove(tree().root, [0, 0], "Kd8")).toBeNull();
  });

  it("refuses a move that is not notation at all", () => {
    expect(addMove(tree().root, [0, 0], "banana")).toBeNull();
  });

  it("gives the new move a usable position and identity", () => {
    const result = addMove(tree().root, [0, 0], "Bc4");
    const node = nodeAtPath(result!.root, result!.path);

    expect(node.fen.split(" ")).toHaveLength(6);
    expect(node.uci).toBe("f1c4");
    expect(node.sideToMove).toBe("b");
    expect(node.ply).toBe(3);
  });

  it("produces a tree that writes and re-parses intact", () => {
    const result = addMove(tree().root, [0, 0], "Bc4");
    const written = writePgn({ Result: "*" }, result!.root);

    const reparsed = parseGameTree(written);
    expect(nodeAtPath(reparsed.root, [0, 0]).children.map((c) => c.san)).toEqual([
      "Nf3",
      "Bc4",
    ]);
  });
});

describe("removeNode", () => {
  it("removes a move and everything after it", () => {
    const root = removeNode(tree().root, [0, 0, 0]);
    expect(mainline(root).map((n) => n.san)).toEqual([null, "e4", "e5"]);
  });

  it("removes only the chosen variation", () => {
    const withAlternative = addMove(tree().root, [0, 0], "Bc4")!.root;
    const root = removeNode(withAlternative, [0, 0, 1]);

    expect(nodeAtPath(root, [0, 0]).children.map((c) => c.san)).toEqual(["Nf3"]);
  });

  it("refuses to remove the starting position", () => {
    // A game without its start is not a game.
    const root = removeNode(tree().root, []);
    expect(mainline(root)).toHaveLength(5);
  });
});

describe("promoteVariation", () => {
  it("makes a variation the main line", () => {
    const withAlternative = addMove(tree().root, [0, 0], "Bc4")!.root;
    const root = promoteVariation(withAlternative, [0, 0, 1]);

    expect(mainline(root).map((n) => n.san)).toEqual([null, "e4", "e5", "Bc4"]);
  });

  it("keeps the former main line as an alternative", () => {
    // Promotion reorders; it must never discard the line that was there.
    const withAlternative = addMove(tree().root, [0, 0], "Bc4")!.root;
    const root = promoteVariation(withAlternative, [0, 0, 1]);

    expect(nodeAtPath(root, [0, 0]).children.map((c) => c.san)).toEqual([
      "Bc4",
      "Nf3",
    ]);
  });

  it("does nothing when the move is already the main line", () => {
    const root = promoteVariation(tree().root, [0, 0, 0]);
    expect(mainline(root).map((n) => n.san)).toEqual([
      null,
      "e4",
      "e5",
      "Nf3",
      "Nc6",
    ]);
  });

  it("reports where the promoted move now lives", () => {
    expect(pathAfterPromotion([0, 0, 1])).toEqual([0, 0, 0]);
  });
});
