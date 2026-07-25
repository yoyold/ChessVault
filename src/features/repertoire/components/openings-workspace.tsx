"use client";

import { useState } from "react";
import type { Color } from "@/core/domain/game";
import { cn } from "@/lib/utils";
import { ColorToggle } from "./color-toggle";
import { ExtractionView } from "./extraction-view";
import { RepertoireView } from "./repertoire-view";

type Tab = "repertoire" | "extract";

const TABS: { id: Tab; label: string }[] = [
  { id: "repertoire", label: "Repertoire" },
  { id: "extract", label: "From my games" },
];

/**
 * The openings workspace: the repertoire itself, and what the played games
 * suggest belongs in it.
 *
 * Colour is held here rather than in either view, so moving between them stays
 * on the same side — switching to the extraction list to check a line and back
 * again should not silently change which repertoire is being edited.
 */
export function OpeningsWorkspace() {
  const [color, setColor] = useState<Color>("white");
  const [tab, setTab] = useState<Tab>("repertoire");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border p-0.5">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={tab === entry.id}
              onClick={() => setTab(entry.id)}
              className={cn(
                "rounded px-3 py-1 text-sm transition-colors",
                tab === entry.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <ColorToggle color={color} onChange={setColor} />
      </div>

      {tab === "repertoire" ? (
        // Keyed by colour so switching side starts from the beginning of that
        // repertoire rather than on a line the other side happened to be on.
        <RepertoireView key={color} color={color} />
      ) : (
        <ExtractionView color={color} />
      )}
    </div>
  );
}
