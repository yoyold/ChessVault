"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export interface TagEditorProps {
  tags: readonly string[];
  /** Called with the whole new list whenever a tag is added or removed. */
  onChange: (tags: string[]) => void;
  /** What the tags belong to, for the labels a screen reader announces. */
  label?: string;
}

/** Tags as removable badges, with a field to add another. */
export function TagEditor({ tags, onChange, label = "tag" }: TagEditorProps) {
  const [draft, setDraft] = useState("");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1 py-1 pr-1 pl-2.5">
          {tag}
          <button
            type="button"
            aria-label={`Remove ${label} ${tag}`}
            className="hover:bg-background/60 rounded p-0.5"
            onClick={() => onChange(tags.filter((entry) => entry !== tag))}
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
          if (trimmed !== "" && !tags.includes(trimmed)) onChange([...tags, trimmed]);
          setDraft("");
        }}
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add tag"
          aria-label={`Add ${label}`}
          className="h-8 w-32"
        />
      </form>
    </div>
  );
}
