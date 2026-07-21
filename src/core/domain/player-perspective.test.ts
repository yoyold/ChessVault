import { describe, expect, it } from "vitest";
import { opponentPerspective, parseElo } from "./player-perspective";

describe("parseElo", () => {
  it("parses a rating", () => {
    expect(parseElo("1437")).toBe(1437);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseElo(" 1602 ")).toBe(1602);
  });

  describe("values that mean 'unknown'", () => {
    // All of these appear in real files. Treating any as a real rating would
    // corrupt averages and rating filters.
    it("rejects an absent tag", () => {
      expect(parseElo(undefined)).toBeNull();
      expect(parseElo(null)).toBeNull();
    });

    it("rejects an empty tag", () => {
      expect(parseElo("")).toBeNull();
    });

    it("rejects a placeholder", () => {
      expect(parseElo("?")).toBeNull();
      expect(parseElo("-")).toBeNull();
    });

    it("rejects zero", () => {
      // Exporters write 0 for an unrated player; averaging that in would drag
      // an opponent-strength figure towards nonsense.
      expect(parseElo("0")).toBeNull();
    });
  });
});

describe("opponentPerspective", () => {
  const players = { white: "Dony, Lukas", black: "Klein, Joerg" };
  const ratings = { whiteElo: 1437, blackElo: 1602 };

  it("reads the opponent from Black when the owner had White", () => {
    expect(opponentPerspective("white", players, ratings)).toEqual({
      opponent: "Klein, Joerg",
      opponentElo: 1602,
      playerElo: 1437,
    });
  });

  it("reads the opponent from White when the owner had Black", () => {
    expect(opponentPerspective("black", players, ratings)).toEqual({
      opponent: "Dony, Lukas",
      opponentElo: 1437,
      playerElo: 1602,
    });
  });

  it("leaves everything unset for a game the owner did not play", () => {
    // Naming one side arbitrarily would pollute the opponent filter with
    // players the user never faced.
    expect(opponentPerspective(null, players, ratings)).toEqual({
      opponent: null,
      opponentElo: null,
      playerElo: null,
    });
  });

  it("keeps the opponent when only their rating is missing", () => {
    const result = opponentPerspective("white", players, {
      whiteElo: 1437,
      blackElo: null,
    });

    expect(result.opponent).toBe("Klein, Joerg");
    expect(result.opponentElo).toBeNull();
  });

  it("treats an empty name as no opponent", () => {
    const result = opponentPerspective(
      "white",
      { white: "Me", black: "" },
      { whiteElo: null, blackElo: null },
    );

    expect(result.opponent).toBeNull();
  });
});
