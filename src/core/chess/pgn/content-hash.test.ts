import { describe, expect, it } from "vitest";
import { gameContentHash } from "./content-hash";

const GAME = '[Event "A"]\n[White "One"]\n\n1. e4 e5 2. Nf3 Nc6 1-0';

describe("gameContentHash", () => {
  it("is stable for identical input", () => {
    expect(gameContentHash(GAME)).toBe(gameContentHash(GAME));
  });

  it("ignores differences in whitespace and line wrapping", () => {
    // Exporters wrap movetext at different widths. Without this, the same game
    // from two tools would import twice — exactly the duplicate being prevented.
    const rewrapped = '[Event "A"]\n[White "One"]\n\n1. e4 e5\n2. Nf3 Nc6 1-0';
    expect(gameContentHash(rewrapped)).toBe(gameContentHash(GAME));
  });

  it("differs when a move differs", () => {
    const other = GAME.replace("Nc6", "d6");
    expect(gameContentHash(other)).not.toBe(gameContentHash(GAME));
  });

  it("differs when a header differs", () => {
    const other = GAME.replace('"One"', '"Two"');
    expect(gameContentHash(other)).not.toBe(gameContentHash(GAME));
  });

  it("treats an annotated version as different content", () => {
    // Adding analysis is new work, not a duplicate; it must not be silently
    // discarded as one.
    const annotated = GAME.replace("1. e4", "1. e4 {a strong move}");
    expect(gameContentHash(annotated)).not.toBe(gameContentHash(GAME));
  });

  it("produces a fixed-width hexadecimal string", () => {
    expect(gameContentHash(GAME)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("distributes distinct games without collisions across a realistic batch", () => {
    // Collisions are handled by comparing full text, so this guards the hash
    // staying useful as an index rather than guarding correctness.
    const hashes = new Set(
      Array.from({ length: 5000 }, (_, i) =>
        gameContentHash(GAME.replace('"One"', `"Player ${i}"`)),
      ),
    );
    expect(hashes.size).toBe(5000);
  });
});
