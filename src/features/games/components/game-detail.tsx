"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/persistence/db";
import { deleteGame, getFullGame } from "@/persistence/repositories/game-repository";

interface GameDetailProps {
  gameId: number;
  onClose: () => void;
  onDeleted: () => void;
}

export function GameDetail({ gameId, onClose, onDeleted }: GameDetailProps) {
  const game = useLiveQuery(() => getFullGame(gameId), [gameId]);

  if (game === undefined) return <Skeleton className="h-full min-h-64" />;

  if (game === null) {
    return (
      <p className="text-muted-foreground p-6 text-sm">
        This game no longer exists.
      </p>
    );
  }

  const { record, content } = game;

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-1">
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">
            {record.white || "?"} vs {record.black || "?"}
          </h2>
          <p className="text-muted-foreground text-sm">
            {[record.event, record.dateIso === "" ? null : record.dateIso, record.result]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close game" onClick={onClose}>
          <X />
        </Button>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Field label="ECO" value={record.eco} />
        <Field label="Opening" value={record.opening} />
        <Field label="Time control" value={record.timeControl} />
        <Field label="Round" value={record.round} />
        <Field label="Site" value={record.site} />
        <Field label="Moves" value={String(Math.ceil(record.plyCount / 2))} />
      </dl>

      <TagEditor gameId={gameId} tags={record.tags} />
      {/*
        Keyed by game so opening a different game remounts the editor with that
        game's notes. Resetting the draft in an effect instead would clobber
        whatever the user was typing whenever the record refreshed.
      */}
      <NotesEditor key={gameId} gameId={gameId} notes={record.notes} />

      <section>
        <h3 className="mb-2 text-sm font-medium">PGN</h3>
        <pre className="bg-muted max-h-64 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">
          {content.pgn}
        </pre>
      </section>

      <Button
        variant="destructive"
        className="gap-2 self-start"
        onClick={async () => {
          await deleteGame(gameId);
          toast.success("Game deleted");
          onDeleted();
        }}
      >
        <Trash2 className="size-4" />
        Delete game
      </Button>
    </div>
  );
}

/**
 * Persistence helpers live outside the components that call them.
 *
 * They read the clock, which is impure, and a function declared in a component
 * body counts as render-scope even when it only ever runs from an event
 * handler.
 */
async function saveTags(gameId: number, tags: string[]) {
  await db.games.update(gameId, { tags, updatedAt: Date.now() });
}

async function saveNotes(gameId: number, notes: string) {
  await db.games.update(gameId, { notes, updatedAt: Date.now() });
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;

  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function TagEditor({ gameId, tags }: { gameId: number; tags: string[] }) {
  const [draft, setDraft] = useState("");

  return (
    <section>
      <h3 className="mb-2 text-sm font-medium">Tags</h3>

      <div className="flex flex-wrap items-center gap-2">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 py-1 pr-1 pl-2.5">
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              className="hover:bg-background/60 rounded p-0.5"
              onClick={() => void saveTags(gameId, tags.filter((entry) => entry !== tag))}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = draft.trim();
            if (trimmed !== "" && !tags.includes(trimmed)) void saveTags(gameId, [...tags, trimmed]);
            setDraft("");
          }}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add tag"
            aria-label="Add tag"
            className="h-8 w-32"
          />
        </form>
      </div>
    </section>
  );
}

function NotesEditor({ gameId, notes }: { gameId: number; notes: string }) {
  const [draft, setDraft] = useState(notes);

  const dirty = draft !== notes;

  return (
    <section>
      <h3 className="mb-2 text-sm font-medium">Notes</h3>
      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="What did you learn from this game?"
        aria-label="Notes"
        rows={4}
      />
      <Button
        size="sm"
        className="mt-2"
        disabled={!dirty}
        onClick={async () => {
          await saveNotes(gameId, draft);
          toast.success("Notes saved");
        }}
      >
        Save notes
      </Button>
    </section>
  );
}
