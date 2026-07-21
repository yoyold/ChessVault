"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { parseGameTree } from "@/core/chess/pgn/parse-tree";
import { PgnParseError } from "@/core/chess/pgn/errors";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSettings } from "@/features/shell/use-settings";
import { GameDetailsForm } from "./game-details-form";
import { persistGame } from "./save-game";

/** Today's date in PGN form, so a new game is dated without the user typing it. */
function todayAsPgnDate(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`;
}

/**
 * Create a game, either empty or from pasted movetext.
 *
 * Both routes end in the same place: a game whose moves can then be entered and
 * annotated on the analysis board. Pasting is a shortcut for getting the moves
 * in, not a separate kind of game.
 */
export function NewGameForm() {
  const router = useRouter();
  const { playerNames } = useSettings();

  const [headers, setHeaders] = useState<Record<string, string>>({
    Event: "",
    Date: todayAsPgnDate(),
    White: playerNames[0] ?? "",
    Black: "",
    Result: "*",
  });

  const [movetext, setMovetext] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true);

    try {
      // Parsed as a whole rather than assembled by hand: the same code path
      // that reads an imported file also validates this one, so a typo in the
      // movetext is caught here rather than producing a game that cannot be
      // opened later.
      const pgn = `${Object.entries(headers)
        .filter(([, value]) => value !== "")
        .map(([tag, value]) => `[${tag} "${value.replace(/"/g, '\\"')}"]`)
        .join("\n")}\n\n${movetext.trim() || headers.Result || "*"}`;

      const tree = parseGameTree(pgn);

      const id = await persistGame({
        headers: tree.headers,
        root: tree.root,
        ownerNames: playerNames,
      });

      toast.success("Game created");
      router.push(`/analysis/?game=${id}`);
    } catch (error) {
      const message =
        error instanceof PgnParseError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unknown error";

      toast.error("Could not create the game", { description: message });
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <GameDetailsForm headers={headers} onChange={setHeaders} />

      <section className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-sm">Moves (optional)</span>
          <Textarea
            value={movetext}
            onChange={(event) => setMovetext(event.target.value)}
            placeholder="1. e4 e5 2. Nf3 Nc6"
            rows={5}
            className="font-mono text-sm"
          />
        </label>
        <p className="text-muted-foreground text-xs">
          Leave this empty to start from the initial position and enter the moves
          on the board.
        </p>
      </section>

      <Button className="self-start" disabled={saving} onClick={() => void create()}>
        {saving ? "Creating…" : "Create game"}
      </Button>
    </div>
  );
}
