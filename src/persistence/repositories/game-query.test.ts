import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/persistence/db";
import type { GameRecord } from "@/core/domain/game";
import {
  distinctTags,
  distinctValues,
  getGamesByIds,
  queryGameIds,
} from "./game-query";

function game(overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    contentHash: Math.random().toString(16),
    white: "Carlsen, Magnus",
    black: "Nepomniachtchi, Ian",
    result: "1-0",
    dateIso: "2024-03-15",
    event: "Tata Steel",
    site: null,
    round: null,
    eco: "C20",
    opening: "King's Pawn Game",
    timeControl: "300+3",
    playerColor: "white",
    whiteElo: 1437,
    blackElo: 1602,
    opponent: "Nepomniachtchi, Ian",
    opponentElo: 1602,
    playerElo: 1437,
    tags: [],
    notes: "",
    plyCount: 40,
    finalFen: "8/8/8/8/8/8/8/8 w - - 0 1",
    searchTokens: ["carlsen", "magnus", "nepomniachtchi", "ian", "tata", "steel"],
    importedAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

async function seed(...games: GameRecord[]) {
  await db.games.bulkAdd(games);
}

beforeEach(async () => {
  await db.open();
  await Promise.all([
    db.games.clear(),
    db.gameContents.clear(),
    db.positions.clear(),
    db.gamePositions.clear(),
  ]);
});

describe("ordering", () => {
  it("returns newest first by date", async () => {
    await seed(
      game({ dateIso: "2024-01-01", white: "Oldest" }),
      game({ dateIso: "2024-06-01", white: "Newest" }),
      game({ dateIso: "2024-03-01", white: "Middle" }),
    );

    const ids = await queryGameIds({}, "date");
    const ordered = await getGamesByIds(ids);

    expect(ordered.map((g) => g.white)).toEqual(["Newest", "Middle", "Oldest"]);
  });

  it("sorts games without a date last", async () => {
    // Treating an unknown date as the epoch would bury real games beneath
    // every undated one.
    await seed(
      game({ dateIso: "", white: "Undated" }),
      game({ dateIso: "2020-01-01", white: "Ancient" }),
    );

    const ordered = await getGamesByIds(await queryGameIds({}, "date"));
    expect(ordered.map((g) => g.white)).toEqual(["Ancient", "Undated"]);
  });

  it("can sort by import time", async () => {
    await seed(
      game({ importedAt: 1, white: "First" }),
      game({ importedAt: 2, white: "Second" }),
    );

    const ordered = await getGamesByIds(await queryGameIds({}, "imported"));
    expect(ordered.map((g) => g.white)).toEqual(["Second", "First"]);
  });

  it("keeps ordering when a filter is applied", async () => {
    // The driving index is chosen for selectivity, not order, so ordering has
    // to be reapplied afterwards.
    await seed(
      game({ dateIso: "2024-01-01", eco: "B12", white: "Old" }),
      game({ dateIso: "2024-09-01", eco: "B12", white: "New" }),
      game({ dateIso: "2024-05-01", eco: "C20", white: "Other" }),
    );

    const ordered = await getGamesByIds(await queryGameIds({ eco: "B12" }, "date"));
    expect(ordered.map((g) => g.white)).toEqual(["New", "Old"]);
  });
});

describe("single filters", () => {
  it("filters by ECO", async () => {
    await seed(game({ eco: "C20" }), game({ eco: "B12" }));
    expect(await queryGameIds({ eco: "B12" })).toHaveLength(1);
  });

  it("filters by colour", async () => {
    await seed(game({ playerColor: "white" }), game({ playerColor: "black" }));
    expect(await queryGameIds({ colour: "black" })).toHaveLength(1);
  });

  it("filters by result", async () => {
    await seed(game({ result: "1-0" }), game({ result: "1/2-1/2" }));
    expect(await queryGameIds({ result: "1/2-1/2" })).toHaveLength(1);
  });

  it("filters by tag", async () => {
    await seed(game({ tags: ["sharp"] }), game({ tags: ["endgame"] }));
    expect(await queryGameIds({ tag: "sharp" })).toHaveLength(1);
  });

  it("filters by event", async () => {
    await seed(game({ event: "Tata Steel" }), game({ event: "Club Night" }));
    expect(await queryGameIds({ event: "Club Night" })).toHaveLength(1);
  });

  it("filters by time control", async () => {
    await seed(game({ timeControl: "300+3" }), game({ timeControl: "600+0" }));
    expect(await queryGameIds({ timeControl: "600+0" })).toHaveLength(1);
  });

  it("matches text by prefix across indexed fields", async () => {
    await seed(
      game({ searchTokens: ["carlsen", "magnus"] }),
      game({ searchTokens: ["firouzja", "alireza"] }),
    );

    expect(await queryGameIds({ text: "carl" })).toHaveLength(1);
    expect(await queryGameIds({ text: "CARL" })).toHaveLength(1);
  });

  it("matches an opponent on either side of the board", async () => {
    await seed(
      game({ white: "Ding, Liren", black: "Other" }),
      game({ white: "Other", black: "Ding, Liren" }),
      game({ white: "Someone", black: "Else" }),
    );

    expect(await queryGameIds({ opponent: "ding" })).toHaveLength(2);
  });

  describe("date ranges", () => {
    beforeEach(async () => {
      await seed(
        game({ dateIso: "2023-06-01" }),
        game({ dateIso: "2024-03-15" }),
        game({ dateIso: "2025-01-01" }),
      );
    });

    it("applies both bounds inclusively", async () => {
      const ids = await queryGameIds({ dateFrom: "2024-01-01", dateTo: "2024-12-31" });
      expect(ids).toHaveLength(1);
    });

    it("applies an open-ended lower bound", async () => {
      expect(await queryGameIds({ dateFrom: "2024-01-01" })).toHaveLength(2);
    });

    it("applies an open-ended upper bound", async () => {
      expect(await queryGameIds({ dateTo: "2024-01-01" })).toHaveLength(1);
    });

    it("excludes undated games from a range", async () => {
      await seed(game({ dateIso: "" }));
      expect(await queryGameIds({ dateFrom: "2000-01-01" })).toHaveLength(3);
    });
  });
});

describe("opponent rating", () => {
  beforeEach(async () => {
    await seed(
      game({ opponentElo: 1200, white: "Weak" }),
      game({ opponentElo: 1600, white: "Middle" }),
      game({ opponentElo: 2000, white: "Strong" }),
      game({ opponentElo: null, white: "Unrated" }),
    );
  });

  it("filters by a rating range", () => {
    return expect(
      queryGameIds({ opponentEloFrom: 1500, opponentEloTo: 1800 }),
    ).resolves.toHaveLength(1);
  });

  it("applies an open-ended lower bound", async () => {
    expect(await queryGameIds({ opponentEloFrom: 1500 })).toHaveLength(2);
  });

  it("excludes games with no known opponent rating", async () => {
    // A game with no rating cannot be shown to fall inside a range.
    expect(await queryGameIds({ opponentEloFrom: 0 })).toHaveLength(3);
  });

  it("sorts strongest opposition first", async () => {
    const ordered = await getGamesByIds(await queryGameIds({}, "opponentElo"));
    expect(ordered.slice(0, 3).map((g) => g.white)).toEqual([
      "Strong",
      "Middle",
      "Weak",
    ]);
  });

  it("combines a rating range with another filter", async () => {
    await seed(game({ opponentElo: 1700, result: "0-1", white: "Loss" }));

    const ids = await queryGameIds({ opponentEloFrom: 1650, result: "0-1" });
    const found = await getGamesByIds(ids);

    expect(found.map((g) => g.white)).toEqual(["Loss"]);
  });
});

describe("tournament", () => {
  it("sorts alphabetically by event", async () => {
    await seed(
      game({ event: "Vereinsmeisterschaft", white: "C" }),
      game({ event: "Bundesliga", white: "A" }),
      game({ event: "SPEM 2025", white: "B" }),
    );

    const ordered = await getGamesByIds(await queryGameIds({}, "event"));
    expect(ordered.map((g) => g.white)).toEqual(["A", "B", "C"]);
  });

  it("filters to a single tournament", async () => {
    await seed(game({ event: "SPEM 2025" }), game({ event: "Bundesliga" }));
    expect(await queryGameIds({ event: "SPEM 2025" })).toHaveLength(1);
  });
});

describe("combined filters", () => {
  it("applies every filter, not only the indexed one", async () => {
    // The core risk of the single-index design: filters the driving index did
    // not serve must still be applied in memory.
    await seed(
      game({ eco: "B12", playerColor: "white", result: "1-0" }),
      game({ eco: "B12", playerColor: "white", result: "0-1" }),
      game({ eco: "B12", playerColor: "black", result: "1-0" }),
      game({ eco: "C20", playerColor: "white", result: "1-0" }),
    );

    const ids = await queryGameIds({ eco: "B12", colour: "white", result: "1-0" });
    expect(ids).toHaveLength(1);
  });

  it("combines a text search with other filters", async () => {
    await seed(
      game({ searchTokens: ["carlsen"], result: "1-0" }),
      game({ searchTokens: ["carlsen"], result: "0-1" }),
      game({ searchTokens: ["firouzja"], result: "1-0" }),
    );

    expect(await queryGameIds({ text: "carlsen", result: "1-0" })).toHaveLength(1);
  });

  it("uses the compound index for colour and result together", async () => {
    await seed(
      game({ playerColor: "white", result: "1-0" }),
      game({ playerColor: "white", result: "0-1" }),
      game({ playerColor: "black", result: "1-0" }),
    );

    expect(await queryGameIds({ colour: "white", result: "1-0" })).toHaveLength(1);
  });

  it("returns nothing when filters cannot be satisfied together", async () => {
    await seed(game({ eco: "B12", result: "1-0" }));
    expect(await queryGameIds({ eco: "B12", result: "0-1" })).toEqual([]);
  });
});

describe("getGamesByIds", () => {
  it("preserves the requested order", async () => {
    // Order comes from the query; bulkGet must not silently reorder it.
    await seed(
      game({ white: "A", dateIso: "2024-01-01" }),
      game({ white: "B", dateIso: "2024-02-01" }),
      game({ white: "C", dateIso: "2024-03-01" }),
    );

    const all = await queryGameIds({}, "date");
    const window = [all[2], all[0]];

    const loaded = await getGamesByIds(window);
    expect(loaded.map((g) => g.white)).toEqual(["A", "C"]);
  });

  it("returns nothing for an empty window", async () => {
    expect(await getGamesByIds([])).toEqual([]);
  });

  it("skips ids that no longer exist", async () => {
    // A game can be deleted between the query and the window fetch.
    await seed(game({ white: "A" }));
    const [id] = await queryGameIds({});

    expect(await getGamesByIds([id, 9_999])).toHaveLength(1);
  });
});

describe("filter option sources", () => {
  it("lists distinct values without duplicates", async () => {
    await seed(game({ eco: "C20" }), game({ eco: "C20" }), game({ eco: "B12" }));
    expect(await distinctValues("eco")).toEqual(["B12", "C20"]);
  });

  it("lists distinct tags across games", async () => {
    await seed(game({ tags: ["sharp", "endgame"] }), game({ tags: ["sharp"] }));
    expect(await distinctTags()).toEqual(["endgame", "sharp"]);
  });

  it("omits games where the field is unset", async () => {
    await seed(game({ eco: "C20" }), game({ eco: null }));
    expect(await distinctValues("eco")).toEqual(["C20"]);
  });
});
