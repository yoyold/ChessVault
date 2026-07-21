"use client";

import { Input } from "@/components/ui/input";
import type { GameResult } from "@/core/domain/game";

/**
 * The tags this form edits.
 *
 * Everything else in the file's headers is left untouched: a PGN can carry
 * annotator names, clock settings and site-specific tags, and a form that
 * rewrote the whole header block would silently drop them.
 */
const RESULTS: { value: GameResult; label: string }[] = [
  { value: "1-0", label: "White won" },
  { value: "0-1", label: "Black won" },
  { value: "1/2-1/2", label: "Draw" },
  { value: "*", label: "Unfinished" },
];

const SELECT_CLASS = "border-input bg-background h-9 w-full rounded-md border px-2 text-sm";

/** PGN writes dates as `YYYY.MM.DD`; the date input speaks `YYYY-MM-DD`. */
function toDateInput(pgnDate: string | undefined): string {
  if (!pgnDate) return "";

  const [year, month, day] = pgnDate.split(".");
  if (!/^\d{4}$/.test(year ?? "")) return "";
  if (!/^\d{2}$/.test(month ?? "") || !/^\d{2}$/.test(day ?? "")) return "";

  return `${year}-${month}-${day}`;
}

function toPgnDate(inputDate: string): string {
  return inputDate === "" ? "" : inputDate.replace(/-/g, ".");
}

interface GameDetailsFormProps {
  headers: Record<string, string>;
  onChange: (headers: Record<string, string>) => void;
}

export function GameDetailsForm({ headers, onChange }: GameDetailsFormProps) {
  /** Set a tag, removing it entirely when cleared rather than writing an empty one. */
  const set = (tag: string, value: string) => {
    const next = { ...headers };

    if (value.trim() === "") delete next[tag];
    else next[tag] = value;

    onChange(next);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Event">
        <Input value={headers.Event ?? ""} onChange={(e) => set("Event", e.target.value)} />
      </Field>

      <Field label="Site">
        <Input value={headers.Site ?? ""} onChange={(e) => set("Site", e.target.value)} />
      </Field>

      <Field label="White">
        <Input value={headers.White ?? ""} onChange={(e) => set("White", e.target.value)} />
      </Field>

      <Field label="White rating">
        <Input
          type="number"
          inputMode="numeric"
          value={headers.WhiteElo ?? ""}
          onChange={(e) => set("WhiteElo", e.target.value)}
        />
      </Field>

      <Field label="Black">
        <Input value={headers.Black ?? ""} onChange={(e) => set("Black", e.target.value)} />
      </Field>

      <Field label="Black rating">
        <Input
          type="number"
          inputMode="numeric"
          value={headers.BlackElo ?? ""}
          onChange={(e) => set("BlackElo", e.target.value)}
        />
      </Field>

      <Field label="Date">
        <Input
          type="date"
          value={toDateInput(headers.Date)}
          onChange={(e) => set("Date", toPgnDate(e.target.value))}
        />
      </Field>

      <Field label="Round">
        <Input value={headers.Round ?? ""} onChange={(e) => set("Round", e.target.value)} />
      </Field>

      <Field label="Result">
        <select
          className={SELECT_CLASS}
          value={headers.Result ?? "*"}
          onChange={(e) => set("Result", e.target.value)}
        >
          {RESULTS.map((result) => (
            <option key={result.value} value={result.value}>
              {result.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Time control">
        <Input
          value={headers.TimeControl ?? ""}
          placeholder="e.g. 5400+30"
          onChange={(e) => set("TimeControl", e.target.value)}
        />
      </Field>

      <Field label="ECO">
        <Input value={headers.ECO ?? ""} onChange={(e) => set("ECO", e.target.value)} />
      </Field>

      <Field label="Opening">
        <Input value={headers.Opening ?? ""} onChange={(e) => set("Opening", e.target.value)} />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-sm">{label}</span>
      {children}
    </label>
  );
}
