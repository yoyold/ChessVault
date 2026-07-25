import { beforeEach, describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { db } from "@/persistence/db";
import { positionKey } from "@/core/chess/position-key";
import { REPERTOIRE_ROOT } from "@/core/domain/repertoire";
import {
  addRepertoireMove,
  clearRepertoire,
  deleteRepertoireMove,
  getContinuations,
  getMovesReaching,
  getRepertoire,
  IllegalRepertoireMoveError,
  updateRepertoireMove,
} from "./repertoire-repository";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Full FEN after a sequence of moves, as the board would report it. */
function fenAfter(...sanMoves: string[]) {
  const board = new Chess();
  for (const san of sanMoves) board.move(san);
  return board.fen();
}

/** Position key after a sequence of moves. */
function keyAfter(...sanMoves: string[]) {
  const board = new Chess();
  for (const san of sanMoves) board.move(san);
  return positionKey(board);
}

/** Prepare a whole line for one colour, as walking it through the board would. */
async function prepare(color: "white" | "black", ...sanMoves: string[]) {
  const board = new Chess();

  for (const san of sanMoves) {
    await addRepertoireMove({ color, fromFen: board.fen(), san });
    board.move(san);
  }
}

beforeEach(async () => {
  await db.open();
  await db.repertoireMoves.clear();
});

describe("addRepertoireMove", () => {
  it("stores the move with both position keys", async () => {
    const move = await addRepertoireMove({
      color: "white",
      fromFen: START_FEN,
      san: "e4",
    });

    expect(move).toMatchObject({
      color: "white",
      fromKey: REPERTOIRE_ROOT,
      san: "e4",
      uci: "e2e4",
      toKey: keyAfter("e4"),
    });
  });

  it("does not duplicate a move already prepared", async () => {
    await addRepertoireMove({ color: "white", fromFen: START_FEN, san: "e4" });
    await addRepertoireMove({ color: "white", fromFen: START_FEN, san: "e4" });

    expect(await db.repertoireMoves.count()).toBe(1);
  });

  it("keeps an existing note when the line is walked again", async () => {
    // Stepping back through a line to look at it must not erase what was
    // written about it.
    await addRepertoireMove({
      color: "white",
      fromFen: START_FEN,
      san: "e4",
      note: "my main weapon",
      priority: 10,
    });
    await addRepertoireMove({ color: "white", fromFen: START_FEN, san: "e4" });

    const [move] = await getContinuations("white", REPERTOIRE_ROOT);
    expect(move.note).toBe("my main weapon");
    expect(move.priority).toBe(10);
  });

  it("keeps the original time the move was added", async () => {
    const first = await addRepertoireMove({
      color: "white",
      fromFen: START_FEN,
      san: "e4",
    });
    const again = await addRepertoireMove({
      color: "white",
      fromFen: START_FEN,
      san: "e4",
    });

    expect(again.addedAt).toBe(first.addedAt);
  });

  it("rejects a move that is not legal in the position", async () => {
    await expect(
      addRepertoireMove({ color: "white", fromFen: START_FEN, san: "Kd8" }),
    ).rejects.toBeInstanceOf(IllegalRepertoireMoveError);
  });

  it("keeps the White and Black repertoires separate", async () => {
    await addRepertoireMove({ color: "white", fromFen: START_FEN, san: "e4" });
    await addRepertoireMove({ color: "black", fromFen: START_FEN, san: "e4" });

    expect(await getRepertoire("white")).toHaveLength(1);
    expect(await getRepertoire("black")).toHaveLength(1);
  });
});

describe("getContinuations", () => {
  it("returns the moves prepared from a position, best first", async () => {
    await addRepertoireMove({ color: "white", fromFen: START_FEN, san: "c4" });
    await addRepertoireMove({
      color: "white",
      fromFen: START_FEN,
      san: "d4",
      priority: 10,
    });

    expect((await getContinuations("white", REPERTOIRE_ROOT)).map((m) => m.san)).toEqual(
      ["d4", "c4"],
    );
  });

  it("returns nothing for a position with no preparation", async () => {
    expect(await getContinuations("white", keyAfter("e4"))).toEqual([]);
  });
});

describe("getMovesReaching", () => {
  it("finds a prepared move by where it leads", async () => {
    await prepare("white", "e4", "e5");

    const reaching = await getMovesReaching("white", keyAfter("e4", "e5"));
    expect(reaching.map((m) => m.san)).toEqual(["e5"]);
  });

  it("finds every move order that arrives at the same position", async () => {
    // The reverse lookup is what lets a position report that the repertoire
    // covers it, even by an order the user did not take to get there.
    await prepare("white", "d4", "Nf6", "c4");
    await prepare("white", "c4", "Nf6", "d4");

    const reaching = await getMovesReaching("white", keyAfter("d4", "Nf6", "c4"));
    expect(reaching.map((m) => m.san).sort()).toEqual(["c4", "d4"]);
  });
});

describe("updateRepertoireMove", () => {
  it("changes the note without touching the move", async () => {
    await addRepertoireMove({ color: "white", fromFen: START_FEN, san: "e4" });
    await updateRepertoireMove("white", REPERTOIRE_ROOT, "e4", {
      note: "play this",
      priority: 5,
    });

    const [move] = await getContinuations("white", REPERTOIRE_ROOT);
    expect(move).toMatchObject({ san: "e4", note: "play this", priority: 5 });
  });
});

describe("deleteRepertoireMove", () => {
  it("removes the move and everything it stranded", async () => {
    await prepare("white", "e4", "e5", "Nf3");

    const result = await deleteRepertoireMove("white", REPERTOIRE_ROOT, "e4");

    expect(result.removed).toBe(3);
    expect(await getRepertoire("white")).toEqual([]);
  });

  it("removes only the branch that was cut", async () => {
    await prepare("white", "e4", "e5");
    await prepare("white", "d4", "d5");

    await deleteRepertoireMove("white", REPERTOIRE_ROOT, "e4");

    expect((await getRepertoire("white")).map((m) => m.san).sort()).toEqual(["d4", "d5"]);
  });

  it("keeps a continuation another move order still reaches", async () => {
    // The transposition case: 2...e6 hangs off a position that 1.c4 Nf6 2.d4
    // still arrives at, so cutting 1.d4 must not take it.
    await prepare("white", "d4", "Nf6", "c4", "e6");
    await prepare("white", "c4", "Nf6", "d4");

    await deleteRepertoireMove("white", REPERTOIRE_ROOT, "d4");

    const remaining = (await getRepertoire("white")).map((m) => m.san);
    expect(remaining).toContain("e6");
  });

  it("leaves the other colour's repertoire alone", async () => {
    await prepare("white", "e4", "e5");
    await prepare("black", "e4", "e5");

    await deleteRepertoireMove("white", REPERTOIRE_ROOT, "e4");

    expect(await getRepertoire("black")).toHaveLength(2);
  });
});

describe("clearRepertoire", () => {
  it("empties one colour only", async () => {
    await prepare("white", "e4", "e5");
    await prepare("black", "d4", "d5");

    await clearRepertoire("white");

    expect(await getRepertoire("white")).toEqual([]);
    expect(await getRepertoire("black")).toHaveLength(2);
  });
});

describe("transpositions share continuations", () => {
  it("offers a move prepared by one order when reached by another", async () => {
    // Prepared through 1.d4 Nf6 2.c4 e6; arriving by 1.c4 Nf6 2.d4 must find
    // the same continuation, because the position is the identity, not the path.
    await prepare("white", "d4", "Nf6", "c4", "e6");
    await prepare("white", "c4", "Nf6", "d4");

    const viaOtherOrder = await getContinuations(
      "white",
      keyAfter("c4", "Nf6", "d4"),
    );

    expect(viaOtherOrder.map((m) => m.san)).toEqual(["e6"]);
  });

  it("stores one edge however many orders prepared it", async () => {
    await prepare("white", "d4", "Nf6", "c4");
    await prepare("white", "c4", "Nf6", "d4");

    // Six distinct edges: d4, Nf6, c4 on one path; c4, Nf6, d4 on the other.
    // The shared destination does not merge the edges leading into it.
    expect(await db.repertoireMoves.count()).toBe(6);
    expect(fenAfter("d4", "Nf6", "c4").split(" ").slice(0, 4)).toEqual(
      fenAfter("c4", "Nf6", "d4").split(" ").slice(0, 4),
    );
  });
});
