"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { importPgn, type ImportResult } from "@/features/games/import/import-games";
import { getSettings } from "@/lib/settings";

/**
 * Import PGN files into the database.
 *
 * Parsing currently runs on the main thread. That is acceptable for the file
 * sizes a personal collection is imported in, but a very large file will make
 * the interface unresponsive while it works; moving the pipeline into a Web
 * Worker is tracked with the rest of the game database interface.
 */
export function ImportCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(
    null,
  );
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    setBusy(true);
    setLastResult(null);

    const { playerNames } = getSettings();

    try {
      // Files are imported one after another rather than concatenated so that
      // a failure in one leaves the others already committed.
      const totals: ImportResult = { total: 0, imported: 0, duplicates: 0, failures: [] };

      for (const file of Array.from(files)) {
        const result = await importPgn(await file.text(), {
          ownerNames: playerNames,
          onProgress: setProgress,
        });

        totals.total += result.total;
        totals.imported += result.imported;
        totals.duplicates += result.duplicates;
        totals.failures.push(...result.failures);
      }

      setLastResult(totals);

      if (totals.imported > 0) {
        toast.success(`Imported ${totals.imported} game${totals.imported === 1 ? "" : "s"}`);
      } else if (totals.duplicates > 0) {
        toast.info("Every game in that file was already in the database");
      } else {
        toast.warning("No games could be read from that file");
      }
    } catch (error) {
      // Reaching here means the file could not be read at all; individual
      // unparseable games are reported through the result, not thrown.
      toast.error("Could not read the file", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
      setProgress(null);
      // Allow re-selecting the same file, which otherwise fires no change event.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="rounded-lg border p-4">
      <h2 className="font-medium">Import games</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Add one or more PGN files. Games already in the database are skipped, and
        your notes are never overwritten.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".pgn,application/x-chess-pgn,text/plain"
        multiple
        className="sr-only"
        onChange={(event) => void handleFiles(event.target.files)}
      />

      <Button
        className="mt-4 gap-2"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" />
        {busy ? "Importing…" : "Choose PGN files"}
      </Button>

      {progress ? (
        <p className="text-muted-foreground mt-3 text-sm tabular-nums">
          {progress.processed.toLocaleString()} of {progress.total.toLocaleString()} games
        </p>
      ) : null}

      {lastResult ? <ImportSummary result={lastResult} /> : null}
    </section>
  );
}

function ImportSummary({ result }: { result: ImportResult }) {
  return (
    <div className="mt-4 space-y-2 border-t pt-4 text-sm">
      <p className="tabular-nums">
        {result.imported.toLocaleString()} imported
        {result.duplicates > 0
          ? `, ${result.duplicates.toLocaleString()} already present`
          : null}
        {result.failures.length > 0
          ? `, ${result.failures.length.toLocaleString()} could not be read`
          : null}
      </p>

      {result.failures.length > 0 ? (
        <details className="text-muted-foreground">
          <summary className="cursor-pointer">Show unreadable games</summary>
          <ul className="mt-2 space-y-1">
            {/*
              Capped: a badly damaged file can produce thousands of failures,
              and rendering all of them would be slower than the import itself.
              The count above remains exact.
            */}
            {result.failures.slice(0, 20).map((failure) => (
              <li key={failure.gameNumber} className="font-mono text-xs">
                Game {failure.gameNumber}: {failure.reason}
              </li>
            ))}
            {result.failures.length > 20 ? (
              <li className="text-xs">
                and {(result.failures.length - 20).toLocaleString()} more
              </li>
            ) : null}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
