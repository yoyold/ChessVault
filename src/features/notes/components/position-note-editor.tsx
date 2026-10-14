"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { NotebookPen } from "lucide-react";
import type { PositionKey } from "@/core/chess/position-key";
import { TagEditor } from "@/components/tag-editor";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  getPositionNote,
  savePositionNote,
  type PositionNote,
} from "@/persistence/repositories/notes-repository";

/** Outside the component: it reads the clock, which render must not. */
function save(key: PositionKey, note: PositionNote) {
  return savePositionNote(key, note, Date.now());
}

export interface PositionNoteEditorProps {
  positionKey: PositionKey;
  /** Leave out the heading and the explanation, where the context says it. */
  bare?: boolean;
}

/**
 * The owner's note on a position: shown, written and tagged.
 *
 * A note on a position is not a comment on a move. The comment belongs to one
 * game's PGN; the note belongs to the position, and shows in every game that
 * reaches it, by any move order.
 */
export function PositionNoteEditor({ positionKey, bare = false }: PositionNoteEditorProps) {
  const note = useLiveQuery(() => getPositionNote(positionKey), [positionKey]);

  // Undefined while loading; null when there is no note.
  if (note === undefined) return null;

  return (
    // Keyed by position, so moving on never carries a draft to another one.
    <NoteBody key={positionKey} positionKey={positionKey} note={note} bare={bare} />
  );
}

function NoteBody({
  positionKey,
  note,
  bare,
}: {
  positionKey: PositionKey;
  note: PositionNote | null;
  bare: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const notes = note?.notes ?? "";
  const tags = note?.tags ?? [];

  if (!note && draft === null) {
    return (
      <Button variant="ghost" size="sm" className="gap-2 self-start" onClick={() => setDraft("")}>
        <NotebookPen className="size-4" />
        Note on this position
      </Button>
    );
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border p-3">
      {bare ? null : (
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <NotebookPen className="size-4" />
            Position note
          </h3>
          <p className="text-muted-foreground text-xs">
            Shown in every game that reaches this position.
          </p>
        </div>
      )}

      {draft === null ? (
        <>
          {notes ? <p className="text-sm whitespace-pre-wrap">{notes}</p> : null}
          <div>
            <Button variant="outline" size="sm" onClick={() => setDraft(notes)}>
              {notes ? "Edit note" : "Write a note"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="What matters here? A plan, a trap, the idea you keep forgetting."
            aria-label="Position note"
            rows={3}
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={draft === notes}
              onClick={async () => {
                await save(positionKey, { notes: draft, tags });
                setDraft(null);
              }}
            >
              Save note
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </>
      )}

      <TagEditor
        tags={tags}
        label="position tag"
        onChange={(next) => void save(positionKey, { notes, tags: next })}
      />
    </section>
  );
}
