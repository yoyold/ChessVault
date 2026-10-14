import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { parsePgn, type ChildNode, type PgnNodeData } from "chessops/pgn";
import { positionKeyFromEngineFen } from "@/core/chess/position-key";
import { parseGameTree, type TreeNode } from "./parse-tree";

/**
 * The tree as the parser built it while chess.js replayed every move.
 *
 * Positions, evaluations and notes are stored under the keys that replay
 * produced, so the faster replay must agree with it exactly — on every FEN,
 * key and spelling of a move, in variations too.
 */
function referenceTree(pgn: string): unknown {
  const [game] = parsePgn(pgn);
  const fenHeader = /\[FEN "([^"]+)"\]/.exec(pgn)?.[1];
  const start = fenHeader ? new Chess(fenHeader) : new Chess();

  const build = (fen: string, children: ChildNode<PgnNodeData>[]): unknown[] =>
    children.flatMap((child) => {
      const board = new Chess(fen);
      let move;
      try {
        move = board.move(child.data.san);
      } catch {
        return [];
      }
      const after = board.fen();
      return [
        {
          fen: after,
          key: positionKeyFromEngineFen(after),
          san: move.san,
          uci: move.lan,
          sideToMove: board.turn(),
          children: build(after, child.children),
        },
      ];
    });

  return build(start.fen(), game.moves.children);
}

function actualTree(pgn: string): unknown {
  const strip = (node: TreeNode): unknown => ({
    fen: node.fen,
    key: node.key,
    san: node.san,
    uci: node.uci,
    sideToMove: node.sideToMove,
    children: node.children.map(strip),
  });
  return parseGameTree(pgn).root.children.map(strip);
}

const CASES: Record<string, string> = {
  "an en-passant capture that is available, and taken":
    "1. e4 a6 2. e5 d5 3. exd6 cxd6 *",
  "a double step no pawn can capture": "1. e4 e5 2. d4 *",
  "an en-passant capture forbidden by a pin":
    '[FEN "8/8/8/8/k3p2R/8/3P4/4K3 w - - 0 1"]\n\n1. d4 Kb5 *',
  "castling on both sides, written with letters and with zeros":
    "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O d6 5. d3 Bg4 6. Nc3 Qd7 7. Be3 0-0-0 *",
  "a promotion with and without the equals sign, and an underpromotion":
    '[FEN "7k/1P2P3/8/8/8/8/6p1/K7 w - - 0 1"]\n\n1. e8=Q+ Kh7 2. b8N g1R+ 3. Ka2 *',
  "check and mate": "1. f3 e5 2. g4 Qh4# 0-1",
  "two knights that can reach the same square":
    "1. Nf3 d5 2. d4 Nf6 3. Nbd2 e6 4. Nb3 Nbd7 *",
  "variations branching from the same position":
    "1. e4 (1. d4 d5 (1... Nf6 2. c4) 2. c4) (1. c4 e5) 1... c5 (1... e5 2. Nf3 (2. f4 exf4)) 2. Nf3 *",
  "a broken variation beside a sound one": "1. e4 (1. e5) (1. d4) 1... e5 *",
};

describe("replaying agrees with chess.js", () => {
  for (const [label, pgn] of Object.entries(CASES)) {
    it(label, () => {
      expect(actualTree(pgn)).toEqual(referenceTree(pgn));
    });
  }

  it("writes no en-passant square when the capture is pinned", () => {
    const afterDoubleStep = parseGameTree(CASES["an en-passant capture forbidden by a pin"]).root
      .children[0];
    expect(afterDoubleStep.san).toBe("d4");
    expect(afterDoubleStep.key).toBe("8/8/8/8/k2Pp2R/8/8/4K3 b - -");
  });

  it("writes the en-passant square when the capture is legal", () => {
    const line = parseGameTree(CASES["an en-passant capture that is available, and taken"]).root;
    const afterD5 = line.children[0].children[0].children[0].children[0];
    expect(afterD5.san).toBe("d5");
    expect(afterD5.key.endsWith(" w KQkq d6")).toBe(true);
  });

  it("reports castling as the king's move", () => {
    const tree = parseGameTree(CASES["castling on both sides, written with letters and with zeros"]);
    const ucis: (string | null)[] = [];
    for (let node = tree.root; node.children.length > 0; node = node.children[0]) {
      ucis.push(node.children[0].uci);
    }
    expect(ucis).toContain("e1g1");
    expect(ucis).toContain("e8c8");
  });
});
