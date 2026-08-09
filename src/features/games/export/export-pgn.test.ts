import { describe, expect, it } from "vitest";
import type { GameRecord } from "@/core/domain/game";
import { collectionFilename, pgnFilename } from "./export-pgn";

function record(overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    contentHash: "h",
    white: "Dony, Lukas",
    black: "Barth, Horst",
    result: "1-0",
    dateIso: "2026-05-24",
    event: null,
    site: null,
    round: null,
    eco: null,
    opening: null,
    timeControl: null,
    playerColor: "white",
    whiteElo: null,
    blackElo: null,
    opponent: null,
    opponentElo: null,
    playerElo: null,
    tags: [],
    notes: "",
    plyCount: 0,
    finalFen: "",
    searchTokens: [],
    importedAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("pgnFilename", () => {
  it("names the file after the players and the date", () => {
    // The comma survives: it is legal in a file name, and chess names are
    // written "Last, First". Only genuinely unsafe characters are replaced.
    expect(pgnFilename(record())).toBe("Dony,_Lukas-vs-Barth,_Horst-2026-05-24.pgn");
  });

  it("strips characters a path would swallow", () => {
    // A slash in a player's name would otherwise turn the name into a folder.
    const name = pgnFilename(record({ white: 'A/B:C*D?"E', black: "F\\G|H" }));

    expect(name).toBe("A_B_C_D_E-vs-F_G_H-2026-05-24.pgn");
    expect(name).not.toMatch(/[<>:"/\\|?*]/);
  });

  it("leaves out a date the game does not have", () => {
    // Undated games store an empty string, which would trail a lone separator.
    expect(pgnFilename(record({ dateIso: "" }))).toBe(
      "Dony,_Lukas-vs-Barth,_Horst.pgn",
    );
  });

  it("stands in for a missing player", () => {
    expect(pgnFilename(record({ white: "", black: "" }))).toBe(
      "Unknown-vs-Unknown-2026-05-24.pgn",
    );
  });

  it("keeps a very long name within bounds", () => {
    const long = "A".repeat(200);
    const name = pgnFilename(record({ white: long, black: long }));

    expect(name.length).toBeLessThan(120);
  });
});

describe("collectionFilename", () => {
  it("stamps the day it was written", () => {
    expect(collectionFilename(new Date("2026-08-09T12:00:00Z"))).toBe(
      "chessvault-2026-08-09.pgn",
    );
  });
});
