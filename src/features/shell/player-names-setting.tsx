"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveSettings } from "@/lib/settings";
import { useSettings } from "./use-settings";

/**
 * Manage the names the database owner plays under.
 *
 * Import uses these to decide which colour the owner had in each game, which
 * every colour-based filter and statistic depends on. Several are supported
 * because the same person appears differently across sources — a club name, an
 * online handle, a spelling with or without accents.
 */
export function PlayerNamesSetting() {
  const { playerNames } = useSettings();
  const [draft, setDraft] = useState("");

  function addName() {
    const trimmed = draft.trim();
    if (trimmed === "") return;

    // Case-insensitive: a second spelling of the same name only slows matching
    // down without matching anything new.
    const exists = playerNames.some(
      (name) => name.toLowerCase() === trimmed.toLowerCase(),
    );

    if (!exists) saveSettings({ playerNames: [...playerNames, trimmed] });

    setDraft("");
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-medium">Your names</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Used to work out which side you played. Word order and punctuation do
          not matter, so <span className="font-mono">Carlsen, Magnus</span> also
          matches <span className="font-mono">Magnus Carlsen</span>.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          addName();
        }}
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a name you play under"
          aria-label="Add a name you play under"
        />
        <Button type="submit" disabled={draft.trim() === ""}>
          Add
        </Button>
      </form>

      {playerNames.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {playerNames.map((name) => (
            <li key={name}>
              <Badge variant="secondary" className="gap-1 py-1 pr-1 pl-2.5">
                {name}
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  className="hover:bg-background/60 rounded p-0.5"
                  onClick={() =>
                    saveSettings({
                      playerNames: playerNames.filter((entry) => entry !== name),
                    })
                  }
                >
                  <X className="size-3" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          No names yet. Games will be imported without a colour assigned to you.
        </p>
      )}
    </section>
  );
}
