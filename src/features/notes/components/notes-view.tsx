"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { BookOpen, ExternalLink, GitBranch, Library } from "lucide-react";
import { formatLine } from "@/core/chess/format-line";
import { fenFromPositionKey, sideToMoveOf } from "@/core/chess/position-key";
import type { Color } from "@/core/domain/game";
import { REPERTOIRE_ROOT } from "@/core/domain/repertoire";
import { buildRepertoireGraph, shortestLineTo } from "@/core/repertoire/repertoire-graph";
import { ResultBadge } from "@/components/result-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AnalysisBoard } from "@/features/analysis/components/analysis-board";
import {
  getAllNotes,
  type GameNoteEntry,
  type PositionNoteEntry,
  type RepertoireNoteEntry,
} from "@/persistence/repositories/notes-repository";
import { getRepertoire } from "@/persistence/repositories/repertoire-repository";
import { cn } from "@/lib/utils";
import { PositionNoteEditor } from "./position-note-editor";

type Kind = "all" | "position" | "game" | "repertoire";

const KINDS: { id: Kind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "position", label: "Positions" },
  { id: "game", label: "Games" },
  { id: "repertoire", label: "Repertoire" },
];

/** Notes shown before asking to see more: each position note carries a board. */
const PAGE = 30;

/** A repertoire note with the line that reaches its move, for display and search. */
type RepertoireNote = RepertoireNoteEntry & { line: string };

type Note =
  | (PositionNoteEntry & { at: number })
  | (GameNoteEntry & { at: number })
  | (RepertoireNote & { at: number });

/** Everything a note can be found by, lowercased. */
function searchText(note: Note): string {
  if (note.kind === "position") return `${note.notes} ${note.tags.join(" ")}`.toLowerCase();
  if (note.kind === "game") {
    const { game } = note;
    return [game.notes, game.white, game.black, game.event, game.opening, ...game.tags]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }
  return `${note.move.note} ${note.line} ${note.move.color}`.toLowerCase();
}

function tagsOf(note: Note): string[] {
  if (note.kind === "position") return note.tags;
  if (note.kind === "game") return note.game.tags;
  return [];
}

/** The line to each noted repertoire move, written out: "1. e4 c5 2. Nf3". */
async function loadRepertoireLines(): Promise<Record<Color, Map<string, string[]>>> {
  const [white, black] = await Promise.all([getRepertoire("white"), getRepertoire("black")]);
  const lines = (moves: typeof white) => {
    const graph = buildRepertoireGraph(moves);
    const byPosition = new Map<string, string[]>();
    for (const move of moves) {
      if (!move.note.trim() || byPosition.has(move.fromKey)) continue;
      byPosition.set(move.fromKey, shortestLineTo(graph, REPERTOIRE_ROOT, move.fromKey) ?? []);
    }
    return byPosition;
  };
  return { white: lines(white), black: lines(black) };
}

/**
 * Everything the owner has written down, in one place: notes on positions,
 * on games and on repertoire moves, newest first, with a way back to each.
 */
export function NotesView() {
  const data = useLiveQuery(async () => {
    const [notes, lines] = await Promise.all([getAllNotes(), loadRepertoireLines()]);
    return { notes, lines };
  });

  const [kind, setKind] = useState<Kind>("all");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);

  const all = useMemo<Note[]>(() => {
    if (!data) return [];
    const { notes, lines } = data;
    return [
      ...notes.positions.map((entry) => ({ ...entry, at: entry.notedAt })),
      ...notes.games.map((entry) => ({ ...entry, at: entry.notedAt })),
      ...notes.repertoire.map((entry) => {
        const before = lines[entry.move.color].get(entry.move.fromKey) ?? [];
        return { ...entry, line: formatLine([...before, entry.move.san]), at: entry.move.addedAt };
      }),
    ].sort((a, b) => b.at - a.at);
  }, [data]);

  const tags = useMemo(() => [...new Set(all.flatMap(tagsOf))].sort(), [all]);

  if (!data) return <Skeleton className="h-64" />;

  const needle = query.trim().toLowerCase();
  const visible = all.filter(
    (note) =>
      (kind === "all" || note.kind === kind) &&
      (tag === null || tagsOf(note).includes(tag)) &&
      (needle === "" || searchText(note).includes(needle)),
  );
  const counts: Record<Kind, number> = {
    all: all.length,
    position: data.notes.positions.length,
    game: data.notes.games.length,
    repertoire: data.notes.repertoire.length,
  };

  if (all.length === 0) return <EmptyState />;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border p-0.5">
          {KINDS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={kind === entry.id}
              onClick={() => {
                setKind(entry.id);
                setShown(PAGE);
              }}
              className={cn(
                "rounded px-3 py-1 text-sm transition-colors",
                kind === entry.id ? "bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              {entry.label}
              <span className="ml-1.5 tabular-nums opacity-70">{counts[entry.id]}</span>
            </button>
          ))}
        </div>
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setShown(PAGE);
          }}
          placeholder="Search notes"
          aria-label="Search notes"
          className="h-9 w-full sm:w-56"
        />
      </div>

      {tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs">Tags</span>
          {tags.map((entry) => (
            <button
              key={entry}
              type="button"
              aria-pressed={tag === entry}
              onClick={() => setTag(tag === entry ? null : entry)}
            >
              <Badge variant={tag === entry ? "default" : "secondary"}>{entry}</Badge>
            </button>
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="text-muted-foreground text-sm">No notes match.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.slice(0, shown).map((note) => (
            <li key={noteKey(note)}>
              <NoteCard note={note} />
            </li>
          ))}
        </ul>
      )}

      {visible.length > shown ? (
        <Button variant="outline" className="self-start" onClick={() => setShown(shown + PAGE)}>
          Show more ({visible.length - shown} left)
        </Button>
      ) : null}
    </div>
  );
}

function noteKey(note: Note): string {
  if (note.kind === "position") return `position:${note.key}`;
  if (note.kind === "game") return `game:${note.game.id}`;
  return `repertoire:${note.move.color}:${note.move.fromKey}:${note.move.san}`;
}

function NoteCard({ note }: { note: Note }) {
  if (note.kind === "position") return <PositionCard note={note} />;
  if (note.kind === "game") return <GameCard note={note} />;
  return <RepertoireCard note={note} />;
}

function Card({
  icon,
  title,
  children,
  aside,
}: {
  icon: ReactNode;
  title: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <article className="flex gap-4 rounded-lg border p-3">
      {aside}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          {icon}
          {title}
        </p>
        {children}
      </div>
    </article>
  );
}

function PositionCard({ note }: { note: PositionNoteEntry }) {
  const [editing, setEditing] = useState(false);
  const orientation = sideToMoveOf(note.key) === "w" ? "white" : "black";

  return (
    <Card
      icon={<BookOpen className="size-3.5" />}
      title={
        <>
          Position · {orientation === "white" ? "White" : "Black"} to move ·{" "}
          {note.games === 0
            ? "in none of your games"
            : `in ${note.games} game${note.games === 1 ? "" : "s"}`}
        </>
      }
      aside={
        // Aligned to the top, so the frame ends with the board instead of
        // stretching to the height of a long note.
        <div className="w-28 shrink-0 self-start overflow-hidden rounded-sm border sm:w-36">
          <AnalysisBoard
            fen={fenFromPositionKey(note.key)}
            orientation={orientation}
            lastMoveUci={null}
          />
        </div>
      }
    >
      {editing ? (
        <PositionNoteEditor positionKey={note.key} bare />
      ) : (
        <>
          <p className="text-sm whitespace-pre-wrap">{note.notes}</p>
          <TagList tags={note.tags} />
        </>
      )}
      <div className="flex flex-wrap gap-1">
        {note.firstOccurrence ? (
          <Button variant="ghost" size="sm" asChild>
            <Link
              href={`/analysis/?game=${note.firstOccurrence.gameId}&ply=${note.firstOccurrence.ply}`}
            >
              <ExternalLink />
              Open in a game
            </Link>
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => setEditing(!editing)}>
          {editing ? "Done" : "Edit"}
        </Button>
      </div>
    </Card>
  );
}

function GameCard({ note }: { note: GameNoteEntry }) {
  const { game } = note;
  const opponent = game.opponent ?? `${game.white} – ${game.black}`;

  return (
    <Card
      icon={<Library className="size-3.5" />}
      title={
        <>
          Game · {game.dateIso || "no date"}
          {game.event ? ` · ${game.event}` : ""}
        </>
      }
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        <ResultBadge result={game.result} playerColor={game.playerColor} className="w-12" />
        <span className="truncate">{game.playerColor ? `vs ${opponent}` : opponent}</span>
      </p>
      <p className="text-sm whitespace-pre-wrap">{game.notes}</p>
      <TagList tags={game.tags} />
      <div className="flex flex-wrap gap-1">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/analysis/?game=${game.id}`}>
            <ExternalLink />
            Open the game
          </Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/games/?id=${game.id}`}>Edit</Link>
        </Button>
      </div>
    </Card>
  );
}

function RepertoireCard({ note }: { note: RepertoireNote }) {
  const { move } = note;

  return (
    <Card
      icon={<GitBranch className="size-3.5" />}
      title={<>{move.color === "white" ? "White" : "Black"} repertoire</>}
    >
      <p className="text-sm font-medium">{note.line}</p>
      <p className="text-sm whitespace-pre-wrap">{move.note}</p>
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/openings/?tab=repertoire&color=${move.color}`}>
            <ExternalLink />
            Open the repertoire
          </Link>
        </Button>
      </div>
    </Card>
  );
}

function TagList({ tags }: { tags: readonly string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <Badge key={tag} variant="secondary">
          {tag}
        </Badge>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex max-w-2xl flex-col gap-2 rounded-md border border-dashed p-6 text-sm">
      <p className="font-medium">No notes yet</p>
      <p className="text-muted-foreground">Notes collect here from three places:</p>
      <ul className="text-muted-foreground list-disc pl-5">
        <li>
          on a position, from the board in{" "}
          <Link href="/analysis/" className="text-foreground underline underline-offset-2">
            Analysis
          </Link>{" "}
          — it then shows in every game that reaches it;
        </li>
        <li>
          on a game, in its details under{" "}
          <Link href="/games/" className="text-foreground underline underline-offset-2">
            Games
          </Link>
          ;
        </li>
        <li>
          on a move of your repertoire, in{" "}
          <Link href="/openings/" className="text-foreground underline underline-offset-2">
            Openings
          </Link>
          .
        </li>
      </ul>
    </div>
  );
}
