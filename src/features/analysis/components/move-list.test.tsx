import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { parseGameTree } from "@/core/chess/pgn/parse-tree";
import type { MoveQuality } from "@/core/analysis/move-quality";
import { MoveList } from "./move-list";

/**
 * A game whose second move has a sideline at the same ply.
 *
 * `1... e5` is the move played; `1... c5` is the alternative. Both are ply 2,
 * which is exactly what made a ply-keyed verdict land on both.
 */
const GAME = "1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *";

function renderList(qualityByPly: Map<number, MoveQuality>) {
  const { root } = parseGameTree(GAME);

  render(
    <MoveList root={root} currentPath={[]} qualityByPly={qualityByPly} onSelect={() => {}} />,
  );
}

/** The annotation badge rendered inside a move's button, if any. */
function badgeOf(san: string, occurrence = 0): string | null {
  const button = screen.getAllByRole("button", { name: new RegExp(`^${san}`) })[occurrence];
  return button.querySelector("span[style]")?.textContent ?? null;
}

describe("MoveList verdicts", () => {
  it("marks the move that was played", () => {
    renderList(new Map([[2, "blunder"]]));

    expect(badgeOf("e5")).toBe("??");
  });

  it("never pins the played move's verdict on a sideline at the same ply", () => {
    // The report judges the game as played. A sideline was never evaluated, so
    // it must show no engine badge — least of all someone else's "??".
    renderList(new Map([[2, "blunder"], [3, "mistake"]]));

    expect(badgeOf("c5")).toBeNull();
    // Nf3 appears twice: once inside the sideline (ply 3), once on the mainline.
    expect(badgeOf("Nf3", 0)).toBeNull();
    expect(badgeOf("Nf3", 1)).toBe("?");
  });

  it("still shows an annotator's own glyph in a sideline", () => {
    // Only the engine's verdict is mainline-only; a glyph someone wrote on a
    // sideline move belongs to that move.
    const { root } = parseGameTree("1. e4 e5 (1... c5!? 2. Nf3) 2. Nf3 *");

    render(<MoveList root={root} currentPath={[]} qualityByPly={new Map()} onSelect={() => {}} />);

    expect(badgeOf("c5")).toBe("!?");
  });
});
