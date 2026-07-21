"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveSettings } from "@/lib/settings";
import { db } from "@/persistence/db";
import { reattributeGames } from "@/features/games/edit/reattribute-games";
import { useSettings } from "./use-settings";

/**
 * Manage the names the database owner plays under.
 *
 * Changing the names reapplies them to games already stored. Attribution is
 * decided when a game is imported, so without this a collection imported before
 * a name was configured would stay unattributed no matter what was typed here —
 * and the connection between the two is not something a user should have to
 * work out.
 */
export function PlayerNamesSetting() {
  const { playerNames } = useSettings();
  const [draft, setDraft] = useState("");
  const [applying, setApplying] = useState(false);

  const unattributed = useLiveQuery(
    () => db.games.filter((game) => game.playerColor === null).count(),
    [],
  );
  const total = useLiveQuery(() => db.games.count(), []);

  /** Save the names and immediately reapply them to stored games. */
  async function commit(next: string[]) {
    saveSettings({ playerNames: next });
    setApplying(true);

    try {
      const { updated } = await reattributeGames(next);

      if (updated > 0) {
        toast.success(
          `Updated ${updated} game${updated === 1 ? "" : "s"} to match your names`,
        );
      }
    } catch (error) {
      toast.error("Names saved, but existing games could not be updated", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setApplying(false);
    }
  }

  function addName() {
    const trimmed = draft.trim();
    if (trimmed === "") return;

    // Case-insensitive: a second spelling of the same name only slows matching
    // down without matching anything new.
    const exists = playerNames.some(
      (name) => name.toLowerCase() === trimmed.toLowerCase(),
    );

    if (!exists) void commit([...playerNames, trimmed]);

    setDraft("");
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-medium">Your names</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Used to work out which side you played, which decides the result colour
          and who counts as your opponent. Word order and punctuation do not
          matter, so <span className="font-mono">Carlsen, Magnus</span> also
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
        <Button type="submit" disabled={draft.trim() === "" || applying}>
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
                    void commit(playerNames.filter((entry) => entry !== name))
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
          No names yet. Games will show no result colour until you add one.
        </p>
      )}

      <AttributionStatus
        total={total}
        unattributed={unattributed}
        applying={applying}
        onReapply={() => void commit(playerNames)}
      />
    </section>
  );
}

/**
 * How many stored games are attributed, with a way to redo it.
 *
 * Stated as a number rather than left to be inferred from the game list: an
 * unattributed game is only visible there as a missing colour, which reads as a
 * display quirk rather than as data waiting to be fixed.
 */
function AttributionStatus({
  total,
  unattributed,
  applying,
  onReapply,
}: {
  total: number | undefined;
  unattributed: number | undefined;
  applying: boolean;
  onReapply: () => void;
}) {
  if (total === undefined || unattributed === undefined || total === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <p className="text-sm">
        {unattributed === 0 ? (
          <>All {total.toLocaleString()} games are attributed to you or an opponent.</>
        ) : (
          <>
            <span className="font-medium">
              {unattributed.toLocaleString()} of {total.toLocaleString()} games
            </span>{" "}
            are not attributed to you, so they show no result colour. That is
            expected for games you did not play in.
          </>
        )}
      </p>

      <Button
        variant="outline"
        size="sm"
        className="w-fit gap-2"
        disabled={applying}
        onClick={onReapply}
      >
        <RefreshCw className={applying ? "size-4 animate-spin" : "size-4"} />
        {applying ? "Updating…" : "Reapply to all games"}
      </Button>
    </div>
  );
}
