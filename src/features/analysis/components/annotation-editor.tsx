"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { formatMoveNumber } from "@/core/chess/pgn/game-timeline";
import type { TreeNode } from "@/core/chess/pgn/parse-tree";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * The glyphs offered as buttons.
 *
 * These six are the ones annotators actually reach for. The full standard runs
 * to hundreds of codes, most of which nobody uses, and offering them all would
 * bury the six that matter.
 */
const MOVE_GLYPHS: { nag: number; symbol: string; label: string }[] = [
  { nag: 1, symbol: "!", label: "Good move" },
  { nag: 2, symbol: "?", label: "Mistake" },
  { nag: 3, symbol: "!!", label: "Brilliant move" },
  { nag: 4, symbol: "??", label: "Blunder" },
  { nag: 5, symbol: "!?", label: "Interesting move" },
  { nag: 6, symbol: "?!", label: "Dubious move" },
];

/** Assessments of the resulting position, which are independent of the move glyph. */
const POSITION_GLYPHS: { nag: number; symbol: string; label: string }[] = [
  { nag: 10, symbol: "=", label: "Equal" },
  { nag: 14, symbol: "⩲", label: "White slightly better" },
  { nag: 15, symbol: "⩱", label: "Black slightly better" },
  { nag: 16, symbol: "±", label: "White clearly better" },
  { nag: 17, symbol: "∓", label: "Black clearly better" },
  { nag: 18, symbol: "+−", label: "White winning" },
  { nag: 19, symbol: "−+", label: "Black winning" },
];

interface AnnotationEditorProps {
  node: TreeNode;
  onCommentsChange: (comments: string[]) => void;
  onNagsChange: (nags: number[]) => void;
  /** Removing this move and everything after it. Absent at the starting position. */
  onDelete?: () => void;
}

export function AnnotationEditor({
  node,
  onCommentsChange,
  onNagsChange,
  onDelete,
}: AnnotationEditorProps) {
  const [draft, setDraft] = useState(node.comments.join("\n\n"));

  const toggle = (nag: number, group: number[]) => {
    const isSet = node.nags.includes(nag);

    // One glyph per group: a move is not both `!` and `?`, and a position is
    // not both equal and winning. Choosing a second replaces the first rather
    // than accumulating a contradiction.
    const withoutGroup = node.nags.filter((existing) => !group.includes(existing));

    onNagsChange(isSet ? withoutGroup : [...withoutGroup, nag]);
  };

  return (
    <section className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">
          {node.san === null
            ? "Starting position"
            : `${formatMoveNumber(node.ply)} ${node.san}`}
        </h3>

        {onDelete ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive ml-auto gap-1"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
            Delete from here
          </Button>
        ) : null}
      </div>

      {node.san !== null ? (
        <div className="flex flex-col gap-2">
          <GlyphRow
            glyphs={MOVE_GLYPHS}
            active={node.nags}
            onToggle={(nag) => toggle(nag, MOVE_GLYPHS.map((g) => g.nag))}
          />
          <GlyphRow
            glyphs={POSITION_GLYPHS}
            active={node.nags}
            onToggle={(nag) => toggle(nag, POSITION_GLYPHS.map((g) => g.nag))}
          />
        </div>
      ) : null}

      <Textarea
        value={draft}
        // Committed on every keystroke, not on blur. Blur is not guaranteed to
        // happen before a save — a keyboard shortcut, for instance, never moves
        // focus — and text the user has already typed must not depend on it.
        // Rebuilding the tree is cheap: the update shares every branch it does
        // not touch, so only the path to this move is rewritten.
        onChange={(event) => {
          setDraft(event.target.value);
          onCommentsChange(event.target.value.split(/\n{2,}/));
        }}
        placeholder="Comment on this move…"
        aria-label="Comment on this move"
        rows={3}
      />
    </section>
  );
}

function GlyphRow({
  glyphs,
  active,
  onToggle,
}: {
  glyphs: { nag: number; symbol: string; label: string }[];
  active: number[];
  onToggle: (nag: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {glyphs.map((glyph) => (
        <button
          key={glyph.nag}
          type="button"
          title={glyph.label}
          aria-label={glyph.label}
          aria-pressed={active.includes(glyph.nag)}
          onClick={() => onToggle(glyph.nag)}
          className={cn(
            "min-w-9 rounded border px-2 py-1 text-sm transition-colors",
            active.includes(glyph.nag)
              ? "bg-primary text-primary-foreground border-primary"
              : "hover:bg-accent",
          )}
        >
          {glyph.symbol}
        </button>
      ))}
    </div>
  );
}
