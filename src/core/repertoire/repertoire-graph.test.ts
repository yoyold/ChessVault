import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { positionKey, positionKeyFromFen } from "@/core/chess/position-key";
import type { Color } from "@/core/domain/game";
import type { RepertoireMove } from "@/core/domain/repertoire";
import {
  buildRepertoireGraph,
  depthsFrom,
  findGaps,
  orphanedMoves,
  reachableFrom,
  repertoireStats,
  shortestLineTo,
} from "./repertoire-graph";

const ROOT = positionKeyFromFen(
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
);

/**
 * Build repertoire moves from lines of SAN, with real position keys.
 *
 * Deduplicated by `[fromKey, san]` exactly as the store's compound primary key
 * does, so two lines sharing an opening produce one edge, not two.
 */
function movesFor(
  color: Color,
  sanLines: string[][],
  priorities: Record<string, number> = {},
): RepertoireMove[] {
  const byId = new Map<string, RepertoireMove>();

  for (const line of sanLines) {
    const board = new Chess();

    for (const san of line) {
      const fromKey = positionKey(board);
      const move = board.move(san);
      const toKey = positionKey(board);
      const id = `${fromKey}|${move.san}`;

      if (!byId.has(id)) {
        byId.set(id, {
          color,
          fromKey,
          san: move.san,
          uci: move.lan,
          toKey,
          note: "",
          priority: priorities[move.san] ?? 0,
          addedAt: 0,
        });
      }
    }
  }

  return [...byId.values()];
}

/** The position key after a sequence of moves from the start. */
function keyAfter(...sanMoves: string[]) {
  const board = new Chess();
  for (const san of sanMoves) board.move(san);
  return positionKey(board);
}

describe("buildRepertoireGraph", () => {
  it("groups moves by the position they start from", () => {
    const graph = buildRepertoireGraph(movesFor("white", [["e4", "e5", "Nf3"]]));

    expect(graph.get(ROOT)?.map((e) => e.san)).toEqual(["e4"]);
    expect(graph.get(keyAfter("e4"))?.map((e) => e.san)).toEqual(["e5"]);
  });

  it("puts higher priority first, so the main line leads", () => {
    const graph = buildRepertoireGraph(
      movesFor("white", [["e4"], ["d4"], ["c4"]], { d4: 10, e4: 5 }),
    );

    expect(graph.get(ROOT)?.map((e) => e.san)).toEqual(["d4", "e4", "c4"]);
  });

  it("orders equal priorities by notation, so rendering is stable", () => {
    const graph = buildRepertoireGraph(movesFor("white", [["e4"], ["d4"], ["c4"]]));

    expect(graph.get(ROOT)?.map((e) => e.san)).toEqual(["c4", "d4", "e4"]);
  });
});

describe("reachableFrom", () => {
  it("includes the starting position", () => {
    expect(reachableFrom(buildRepertoireGraph([]), ROOT)).toEqual(new Set([ROOT]));
  });

  it("follows every branch", () => {
    const graph = buildRepertoireGraph(
      movesFor("white", [
        ["e4", "e5", "Nf3"],
        ["e4", "c5", "Nf3"],
      ]),
    );

    const reachable = reachableFrom(graph, ROOT);
    expect(reachable.has(keyAfter("e4", "e5", "Nf3"))).toBe(true);
    expect(reachable.has(keyAfter("e4", "c5", "Nf3"))).toBe(true);
  });

  it("visits a transposed position once, however many orders reach it", () => {
    // 1.d4 Nf6 2.c4 and 1.c4 Nf6 2.d4 arrive at the same position — the whole
    // reason the repertoire is keyed by position rather than shaped as a tree.
    const graph = buildRepertoireGraph(
      movesFor("white", [
        ["d4", "Nf6", "c4"],
        ["c4", "Nf6", "d4"],
      ]),
    );

    const reachable = reachableFrom(graph, ROOT);
    expect(keyAfter("d4", "Nf6", "c4")).toBe(keyAfter("c4", "Nf6", "d4"));
    expect([...reachable].filter((k) => k === keyAfter("d4", "Nf6", "c4"))).toHaveLength(1);
  });

  it("terminates when a line returns to a position it already visited", () => {
    // 1.Nf3 Nf6 2.Ng1 Ng8 is back at the start. Without a visited set this
    // would loop forever rather than merely report the wrong answer.
    const graph = buildRepertoireGraph(movesFor("white", [["Nf3", "Nf6", "Ng1", "Ng8"]]));

    const reachable = reachableFrom(graph, ROOT);
    expect(reachable.has(ROOT)).toBe(true);
    expect(reachable.size).toBe(4);
  });
});

describe("depthsFrom", () => {
  it("measures distance in plies from the start", () => {
    const graph = buildRepertoireGraph(movesFor("white", [["e4", "e5", "Nf3"]]));
    const depths = depthsFrom(graph, ROOT);

    expect(depths.get(ROOT)).toBe(0);
    expect(depths.get(keyAfter("e4"))).toBe(1);
    expect(depths.get(keyAfter("e4", "e5", "Nf3"))).toBe(3);
  });

  it("reports the shorter route to a transposed position", () => {
    // The Nf3 move order reaches the same position two plies later; the honest
    // answer to "how deep before I meet this" is the shorter one.
    const graph = buildRepertoireGraph(
      movesFor("white", [
        ["d4", "d5", "Nf3"],
        ["Nf3", "d5", "d4"],
      ]),
    );

    expect(depthsFrom(graph, ROOT).get(keyAfter("d4", "d5", "Nf3"))).toBe(3);
  });
});

describe("findGaps", () => {
  it("reports a position where the owner must move with nothing prepared", () => {
    // After 1.e4 e5 it is White's turn again and the repertoire stops.
    const graph = buildRepertoireGraph(movesFor("white", [["e4", "e5"]]));

    expect(findGaps(graph, ROOT, "white")).toEqual([keyAfter("e4", "e5")]);
  });

  it("does not count a position where the opponent is to move", () => {
    // After 1.e4 it is Black's turn. Black's options cannot be enumerated, so
    // counting these would make every prepared line look unfinished.
    const graph = buildRepertoireGraph(movesFor("white", [["e4"]]));

    expect(findGaps(graph, ROOT, "white")).toEqual([]);
  });

  it("treats an empty White repertoire as a gap at the start", () => {
    expect(findGaps(buildRepertoireGraph([]), ROOT, "white")).toEqual([ROOT]);
  });

  it("does not treat an empty Black repertoire as a gap at the start", () => {
    // White moves first, so Black has nothing to decide in the initial position.
    expect(findGaps(buildRepertoireGraph([]), ROOT, "black")).toEqual([]);
  });

  it("reads the same position from Black's side of the repertoire", () => {
    const graph = buildRepertoireGraph(movesFor("black", [["e4"]]));

    expect(findGaps(graph, ROOT, "black")).toEqual([keyAfter("e4")]);
  });

  it("lists shallower gaps first", () => {
    const graph = buildRepertoireGraph(
      movesFor("white", [
        ["e4", "e5"],
        ["e4", "c5", "Nf3", "d6"],
      ]),
    );

    expect(findGaps(graph, ROOT, "white")).toEqual([
      keyAfter("e4", "e5"),
      keyAfter("e4", "c5", "Nf3", "d6"),
    ]);
  });
});

describe("shortestLineTo", () => {
  it("recovers the moves that reach a position", () => {
    const graph = buildRepertoireGraph(movesFor("white", [["e4", "e5", "Nf3"]]));

    expect(shortestLineTo(graph, ROOT, keyAfter("e4", "e5", "Nf3"))).toEqual([
      "e4",
      "e5",
      "Nf3",
    ]);
  });

  it("returns an empty line for the starting position", () => {
    expect(shortestLineTo(buildRepertoireGraph([]), ROOT, ROOT)).toEqual([]);
  });

  it("returns null when nothing prepared reaches the position", () => {
    const graph = buildRepertoireGraph(movesFor("white", [["e4"]]));

    expect(shortestLineTo(graph, ROOT, keyAfter("d4"))).toBeNull();
  });

  it("prefers the shorter of two move orders", () => {
    const graph = buildRepertoireGraph(
      movesFor("white", [
        ["d4", "d5", "Nf3"],
        ["Nf3", "d5", "d4"],
      ]),
    );

    // Both orders end at the same position; either is three plies here, so the
    // assertion is that the line returned genuinely arrives there.
    const line = shortestLineTo(graph, ROOT, keyAfter("d4", "d5", "Nf3"));
    expect(line).toHaveLength(3);
    expect(keyAfter(...(line as string[]))).toBe(keyAfter("d4", "d5", "Nf3"));
  });

  it("finds a gap so it can be navigated to", () => {
    const graph = buildRepertoireGraph(
      movesFor("white", [["e4", "c5", "Nf3", "d6"]]),
    );
    const [gap] = findGaps(graph, ROOT, "white");

    expect(shortestLineTo(graph, ROOT, gap)).toEqual(["e4", "c5", "Nf3", "d6"]);
  });
});

describe("orphanedMoves", () => {
  it("finds moves stranded when the line to them is cut", () => {
    const all = movesFor("white", [["e4", "e5", "Nf3"]]);
    const withoutFirst = all.filter((move) => move.san !== "e4");

    expect(orphanedMoves(withoutFirst, ROOT).map((m) => m.san)).toEqual(["e5", "Nf3"]);
  });

  it("keeps what follows a shared position when one route to it is cut", () => {
    // Both orders reach the same position after two moves. Cutting 1.d4
    // strands the moves only that order visited, but 2...e6 continues from the
    // shared position, which 1.c4 Nf6 2.d4 still reaches — so it survives.
    // Walking down from the deleted move would have deleted it too.
    const all = movesFor("white", [
      ["d4", "Nf6", "c4", "e6"],
      ["c4", "Nf6", "d4"],
    ]);

    const orphans = orphanedMoves(
      all.filter((move) => !(move.fromKey === ROOT && move.san === "d4")),
      ROOT,
    );

    expect(orphans.map((m) => m.san)).toEqual(["Nf6", "c4"]);
    expect(orphans.map((m) => m.san)).not.toContain("e6");
  });

  it("reports nothing for an intact repertoire", () => {
    expect(orphanedMoves(movesFor("white", [["e4", "e5"]]), ROOT)).toEqual([]);
  });
});

describe("repertoireStats", () => {
  it("summarises size, reach and holes", () => {
    const moves = movesFor("white", [
      ["e4", "e5", "Nf3"],
      ["e4", "c5"],
    ]);

    expect(repertoireStats(moves, ROOT, "white")).toEqual({
      moveCount: 4,
      positionCount: 5,
      // 1.e4 e5 2.Nf3 — three plies deep.
      maxDepth: 3,
      // After 1.e4 c5 it is White to move with nothing prepared.
      gapCount: 1,
    });
  });

  it("describes an empty repertoire without dividing by zero", () => {
    expect(repertoireStats([], ROOT, "white")).toEqual({
      moveCount: 0,
      positionCount: 1,
      maxDepth: 0,
      gapCount: 1,
    });
  });
});
