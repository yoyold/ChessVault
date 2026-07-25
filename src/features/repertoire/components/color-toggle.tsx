"use client";

import type { Color } from "@/core/domain/game";
import { cn } from "@/lib/utils";

/**
 * Choose which repertoire is being worked on.
 *
 * Shared by the tree and the extraction view: both are always about one side,
 * and holding the choice in one place is what lets the two stay on the same
 * repertoire when the user moves between them.
 */
export function ColorToggle({
  color,
  onChange,
}: {
  color: Color;
  onChange: (color: Color) => void;
}) {
  return (
    <div className="flex rounded-md border p-0.5">
      {(["white", "black"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={color === option}
          onClick={() => onChange(option)}
          className={cn(
            "rounded px-3 py-1 text-sm capitalize transition-colors",
            color === option ? "bg-primary text-primary-foreground" : "hover:bg-accent",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
