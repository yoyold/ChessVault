import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { positionKey } from "@/core/chess/position-key";
import type { RepertoireMove } from "@/core/domain/repertoire";
import {
  compareNewOpenings,
  formatLine,
  judgeOpeningMove,
  openingCards,
} from "./opening-cards";

type Prepared = Pick<RepertoireMove, "fromKey" | "toKey" | "san" | "uci" | "priority">;

/** Prepared moves from lines of SAN, one edge per position and move. */
function prepared(lines: string[][], priorities: Record<string, number> = {}): Prepared[] {
  const byId = new Map<string, Prepared>();
  for (const line of lines) {
    const board = new Chess();
    for (const san of line) {
      const fromKey = positionKey(board);
      const move = board.move(san);
      byId.set(`${fromKey}|${move.san}`, {
        fromKey,
        toKey: positionKey(board),
        san: move.san,
        uci: `${move.from}${move.to}${move.promotion ?? ""}`,
        priority: priorities[move.san] ?? 0,
      });
    }
  }
  return [...byId.values()];
}

describe("openingCards", () => {
  it("makes a card for each position where the owner is to move", () => {
    const cards = openingCards(
      "white",
      prepared([
        ["e4", "c5", "Nf3"],
        ["e4", "e5", "Nf3", "Nc6", "Bb5"],
      ]),
    );

    expect(cards.map((card) => [card.line.join(" "), card.answers])).toEqual([
      ["", ["e4"]],
      ["e4 c5", ["Nf3"]],
      ["e4 e5", ["Nf3"]],
      ["e4 e5 Nf3 Nc6", ["Bb5"]],
    ]);
  });

  it("does not ask for the opponent's moves", () => {
    const cards = openingCards("black", prepared([["e4", "c5", "Nf3", "d6"]]));

    expect(cards.map((card) => card.answers)).toEqual([["c5"], ["d6"]]);
    expect(cards.every((card) => card.fen.split(" ")[1] === "b")).toBe(true);
  });

  it("accepts every prepared alternative, main line first", () => {
    const [root] = openingCards("white", prepared([["d4"], ["e4"], ["c4"]], { e4: 2, d4: 1 }));

    expect(root.answers).toEqual(["e4", "d4", "c4"]);
  });

  it("sets up the board as the line leaves it", () => {
    const card = openingCards("white", prepared([["e4", "c5", "Nf3", "d6", "d4"]]))[2];

    expect(card.line).toEqual(["e4", "c5", "Nf3", "d6"]);
    expect(card.previousUci).toBe("d7d6");
    // Move three, White to move.
    expect(card.fen).toBe(`${card.positionKey} 0 3`);
    expect(new Chess(card.fen).move("d4").san).toBe("d4");
  });

  it("asks for a position reached by several move orders once", () => {
    const cards = openingCards(
      "white",
      prepared([
        ["d4", "Nf6", "c4", "e6", "Nc3"],
        ["c4", "e6", "d4", "Nf6", "Nc3"],
        ["c4", "Nf6", "d4", "e6", "Nc3"],
      ]),
    );

    const transposed = cards.filter((card) => card.answers.includes("Nc3"));
    expect(transposed).toHaveLength(1);
    expect(transposed[0].line).toHaveLength(4);
  });

  it("leaves out moves no line reaches any more", () => {
    // The continuation stays stored after the move before it is deleted.
    const moves = prepared([["e4", "c5", "Nf3"]]).filter((move) => move.san !== "c5");

    expect(openingCards("white", moves).map((card) => card.answers)).toEqual([["e4"]]);
  });

  it("separates the two repertoires", () => {
    const moves = prepared([["e4", "c5", "Nf3"]]);

    expect(openingCards("white", moves)[0].id).not.toBe(openingCards("black", moves)[0].id);
  });

  it("is empty for an empty repertoire", () => {
    expect(openingCards("white", [])).toEqual([]);
  });
});

describe("compareNewOpenings", () => {
  it("introduces shallow positions first", () => {
    const lines = [{ line: ["e4", "c5"] }, { line: [] }, { line: ["e4", "c5", "Nf3", "d6"] }];

    expect(lines.sort(compareNewOpenings).map((card) => card.line.length)).toEqual([0, 2, 4]);
  });
});

describe("formatLine", () => {
  it("numbers White's moves", () => {
    expect(formatLine(["e4", "c5", "Nf3"])).toBe("1. e4 c5 2. Nf3");
    expect(formatLine([])).toBe("");
  });
});

describe("judgeOpeningMove", () => {
  // After 1.e4 c5, with 2.Nf3 as the main line and 2.c3 prepared too.
  const [, card] = openingCards(
    "white",
    prepared([["e4", "c5", "Nf3"], ["e4", "c5", "c3"]], { Nf3: 1 }),
  );

  it("knows the main line", () => {
    expect(judgeOpeningMove(card, { from: "g1", to: "f3" })).toEqual({
      outcome: "main",
      san: "Nf3",
    });
  });

  it("accepts a prepared alternative", () => {
    expect(judgeOpeningMove(card, { from: "c2", to: "c3" })).toEqual({
      outcome: "alternative",
      san: "c3",
    });
  });

  it("rejects a move the repertoire does not play", () => {
    expect(judgeOpeningMove(card, { from: "d2", to: "d4" })).toEqual({
      outcome: "wrong",
      san: "d4",
    });
  });

  it("refuses an illegal move", () => {
    expect(() => judgeOpeningMove(card, { from: "e1", to: "e3" })).toThrow();
  });
});
