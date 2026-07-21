import { describe, expect, it } from "vitest";
import { parseGameTree } from "./parse-tree";
import {
  alternativesAt,
  clampPath,
  displayLine,
  endOfLinePath,
  nextPath,
  nodeAtPath,
  previousPath,
  switchVariation,
} from "./tree-path";

/**
 * Two alternatives to 2.Nf3, one of which continues for two more moves.
 *
 * The parentheses sit immediately after the move they replace: a variation
 * placed later would attach to a different move and describe a different tree.
 */
const GAME = "1.e4 e5 2.Nf3 (2.f4 exf4 3.Nf3) (2.Bc4 Nf6) 2...Nc6 *";

const root = () => parseGameTree(GAME).root;

describe("nodeAtPath", () => {
  it("resolves the starting position for an empty path", () => {
    expect(nodeAtPath(root(), []).san).toBeNull();
  });

  it("follows the mainline", () => {
    expect(nodeAtPath(root(), [0, 0, 0]).san).toBe("Nf3");
  });

  it("follows a variation", () => {
    expect(nodeAtPath(root(), [0, 0, 1]).san).toBe("f4");
  });

  it("degrades to the deepest reachable node for a stale path", () => {
    // A stale path should not break the view.
    expect(nodeAtPath(root(), [0, 0, 9, 9]).san).toBe("e5");
  });
});

describe("clampPath", () => {
  it("keeps a valid path unchanged", () => {
    expect(clampPath(root(), [0, 0, 1])).toEqual([0, 0, 1]);
  });

  it("trims to the deepest resolvable prefix", () => {
    expect(clampPath(root(), [0, 0, 9])).toEqual([0, 0]);
  });
});

describe("displayLine", () => {
  it("shows the mainline from the start", () => {
    const line = displayLine(root(), []);
    expect(line.slice(1).map((n) => n.san)).toEqual(["e4", "e5", "Nf3", "Nc6"]);
  });

  it("continues along a sideline once inside it", () => {
    // The moves played to get here, then how this branch continues — not the
    // game's mainline regardless of where the reader is.
    const line = displayLine(root(), [0, 0, 1]);
    expect(line.slice(1).map((n) => n.san)).toEqual(["e4", "e5", "f4", "exf4", "Nf3"]);
  });
});

describe("stepping", () => {
  it("advances along the current branch", () => {
    expect(nextPath(root(), [0, 0, 1])).toEqual([0, 0, 1, 0]);
  });

  it("returns null at the end of a branch", () => {
    expect(nextPath(root(), [0, 0, 2, 0])).toBeNull();
  });

  it("steps back", () => {
    expect(previousPath([0, 0, 1])).toEqual([0, 0]);
  });

  it("returns null at the start", () => {
    expect(previousPath([])).toBeNull();
  });

  it("runs to the end of the branch it is on", () => {
    // From inside the 2.f4 sideline, the end is that sideline's end.
    expect(endOfLinePath(root(), [0, 0, 1])).toEqual([0, 0, 1, 0, 0]);
  });
});

describe("variations", () => {
  it("lists the alternatives to the current move", () => {
    const alternatives = alternativesAt(root(), [0, 0, 0]);
    expect(alternatives.map((a) => a.node.san)).toEqual(["f4", "Bc4"]);
  });

  it("excludes the move currently chosen", () => {
    const alternatives = alternativesAt(root(), [0, 0, 1]);
    expect(alternatives.map((a) => a.node.san)).toEqual(["Nf3", "Bc4"]);
  });

  it("has no alternatives at the starting position", () => {
    expect(alternativesAt(root(), [])).toEqual([]);
  });

  it("switches branch while keeping the moves before it", () => {
    expect(switchVariation([0, 0, 0], 1)).toEqual([0, 0, 1]);
  });
});
