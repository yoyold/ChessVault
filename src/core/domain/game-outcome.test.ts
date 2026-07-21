import { describe, expect, it } from "vitest";
import { outcomeFor } from "./game-outcome";

describe("outcomeFor", () => {
  describe("as White", () => {
    it("reads 1-0 as a win", () => {
      expect(outcomeFor("white", "1-0")).toBe("win");
    });

    it("reads 0-1 as a loss", () => {
      expect(outcomeFor("white", "0-1")).toBe("loss");
    });
  });

  describe("as Black", () => {
    // The same result means the opposite outcome, which is the whole reason
    // this cannot be read off the result alone.
    it("reads 0-1 as a win", () => {
      expect(outcomeFor("black", "0-1")).toBe("win");
    });

    it("reads 1-0 as a loss", () => {
      expect(outcomeFor("black", "1-0")).toBe("loss");
    });
  });

  it("reads a draw as a draw for either colour", () => {
    expect(outcomeFor("white", "1/2-1/2")).toBe("draw");
    expect(outcomeFor("black", "1/2-1/2")).toBe("draw");
  });

  describe("when the question does not apply", () => {
    it("has no outcome for an unfinished game", () => {
      expect(outcomeFor("white", "*")).toBeNull();
    });

    it("has no outcome for a game the owner did not play", () => {
      // Colouring these by the bare result would claim "you won" about a game
      // between two other people.
      expect(outcomeFor(null, "1-0")).toBeNull();
      expect(outcomeFor(null, "1/2-1/2")).toBeNull();
    });
  });
});
