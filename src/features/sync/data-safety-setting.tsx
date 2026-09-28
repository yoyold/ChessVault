"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, Loader2, ShieldAlert, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { db } from "@/persistence/db";
import {
  getPersistenceState,
  getStorageUsage,
  requestPersistence,
  type PersistenceState,
  type StorageUsage,
} from "@/lib/storage-persistence";
import {
  downloadBackup,
  getLastBackupAt,
  parseBackup,
  restoreBackup,
  summariseSnapshot,
  type BackupSummary,
} from "./backup-file";
import type { Snapshot } from "./snapshot";

const DAY = 24 * 60 * 60 * 1000;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** "today", "yesterday" or "12 days ago" — how stale a backup is, at a glance. */
function formatAge(timestamp: number, now = Date.now()): string {
  const days = Math.floor((now - timestamp) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function describeBackup(summary: BackupSummary): string {
  const parts = [
    `${summary.games.toLocaleString()} game${summary.games === 1 ? "" : "s"}`,
    `${summary.evaluations.toLocaleString()} stored evaluation${summary.evaluations === 1 ? "" : "s"}`,
    `${summary.repertoireMoves.toLocaleString()} repertoire move${summary.repertoireMoves === 1 ? "" : "s"}`,
  ];

  return parts.join(", ");
}

/**
 * Everything that keeps the database from being lost.
 *
 * The data lives in this browser and nowhere else unless the owner puts it
 * somewhere, so this section says plainly how safe it is right now and offers
 * the two things that make it safer: asking the browser to keep it, and a file
 * copy that survives the browser not keeping it.
 */
export function DataSafetySetting() {
  const [persistence, setPersistence] = useState<PersistenceState | null>(null);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(null);
  const [busy, setBusy] = useState<"idle" | "backup" | "persist" | "restore">("idle");
  const [pending, setPending] = useState<{
    snapshot: Snapshot;
    summary: BackupSummary;
    /** How many games the restore would replace, read when the file was chosen. */
    currentGames: number;
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Only a trigger for re-reading the storage figures when the data changes.
  const currentGames = useLiveQuery(() => db.games.count());

  // Read after mount: none of this exists during the static export, and a
  // guessed value rendered there would flash before the real one replaced it.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [state, space] = await Promise.all([getPersistenceState(), getStorageUsage()]);
      if (cancelled) return;
      setPersistence(state);
      setUsage(space);
      setLastBackupAt(getLastBackupAt());
    })();

    return () => {
      cancelled = true;
    };
  }, [currentGames]);

  async function keepData() {
    setBusy("persist");

    try {
      const state = await requestPersistence();
      setPersistence(state);

      if (state === "persistent") {
        toast.success("This browser will now keep your data");
      } else {
        // Not a failure: the browser decides, and often says no to a site it
        // has not seen much of. Saying what helps is more use than an error.
        toast.info("The browser declined for now", {
          description:
            "Browsers grant this to sites they see used regularly, or to installed apps. Keep a backup file either way.",
        });
      }
    } finally {
      setBusy("idle");
    }
  }

  async function backup() {
    setBusy("backup");

    try {
      const summary = await downloadBackup();
      setLastBackupAt(getLastBackupAt());
      toast.success("Backup saved", { description: describeBackup(summary) });
    } catch (error) {
      toast.error("Could not write the backup", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy("idle");
    }
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return;

    try {
      const snapshot = parseBackup(await file.text());
      // Nothing is replaced yet: the file is only read and checked, so the
      // owner sees what it holds before deciding. The count of what would be
      // lost is read now rather than taken from a live query, because it is
      // the figure an irreversible decision rests on and must not be stale.
      setPending({
        snapshot,
        summary: summariseSnapshot(snapshot),
        currentGames: await db.games.count(),
      });
    } catch (error) {
      toast.error("Could not use that file", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      // Cleared so choosing the same file again still fires a change.
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function confirmRestore() {
    if (!pending) return;
    setBusy("restore");

    try {
      await restoreBackup(pending.snapshot);
      toast.success("Backup restored", { description: describeBackup(pending.summary) });
      setPending(null);
    } catch (error) {
      toast.error("Could not restore the backup", {
        description: `${error instanceof Error ? error.message : "Unknown error"} Nothing on this device was changed.`,
      });
    } finally {
      setBusy("idle");
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-medium">Data safety</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Your games, analysis and repertoire are stored in this browser only.
          Clearing site data, or the browser clearing it for you, removes them.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
        {persistence === null ? (
          <p className="text-muted-foreground">Checking storage…</p>
        ) : persistence === "persistent" ? (
          <p className="flex items-center gap-2">
            <ShieldCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            This browser will keep your data until you clear it yourself.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex min-w-0 flex-1 items-start gap-2">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              {persistence === "best-effort"
                ? "The browser may clear your data when space runs low or the site goes unused for a while."
                : "This browser cannot promise to keep your data. A backup file is your safeguard."}
            </p>
            {persistence === "best-effort" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== "idle"}
                onClick={() => void keepData()}
              >
                {busy === "persist" ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Keep my data
              </Button>
            ) : null}
          </div>
        )}

        {usage ? (
          <p className="text-muted-foreground tabular-nums">
            Using {formatBytes(usage.usage)} of the {formatBytes(usage.quota)} this browser allows.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button className="gap-2" disabled={busy !== "idle"} onClick={() => void backup()}>
            {busy === "backup" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Download backup
          </Button>

          <Button
            variant="outline"
            className="gap-2"
            disabled={busy !== "idle"}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="size-4" />
            Restore from backup
          </Button>

          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => void chooseFile(event.target.files?.[0])}
          />
        </div>

        <p className="text-muted-foreground text-xs">
          {lastBackupAt
            ? `Last backup from this device: ${formatAge(lastBackupAt)}.`
            : "No backup made from this device yet."}{" "}
          A backup holds your games with their annotations, stored engine
          evaluations, repertoire and settings. It never contains your GitHub
          token.
        </p>
      </div>

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace everything on this device?</DialogTitle>
            <DialogDescription asChild>
              <div className="flex flex-col gap-2">
                {pending ? (
                  <p>
                    This backup from{" "}
                    {new Date(pending.summary.createdAt).toLocaleString()}
                    {pending.summary.device ? ` (${pending.summary.device})` : ""} holds{" "}
                    {describeBackup(pending.summary)}.
                  </p>
                ) : null}
                {pending && pending.currentGames > 0 ? (
                  <p>
                    It replaces the {pending.currentGames.toLocaleString()} game
                    {pending.currentGames === 1 ? "" : "s"} currently here, together
                    with their analysis and your repertoire. This cannot be undone —
                    download a backup of the current data first if you might want it
                    back.
                  </p>
                ) : (
                  <p>This device has no games yet, so nothing will be lost.</p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={busy === "restore"}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmRestore()}
              disabled={busy === "restore"}
            >
              {busy === "restore" ? "Restoring…" : "Replace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
