"use client";

import { useState } from "react";
import { CloudDownload, CloudUpload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsHydrated } from "@/features/shell/use-hydrated";
import { DecryptionError } from "./crypto";
import { GitHubTarget } from "./github-target";
import { SnapshotError } from "./snapshot";
import {
  isConfigComplete,
  loadSyncConfig,
  saveSyncConfig,
  type SyncConfig,
} from "./sync-config";
import {
  getSyncState,
  PassphraseRequiredError,
  pullSnapshot,
  pushSnapshot,
} from "./sync-service";
import { SyncAuthError, SyncConflictError, SyncError } from "./sync-target";

export function SyncSetting() {
  const hydrated = useIsHydrated();

  if (!hydrated) return <Skeleton className="h-64 rounded-lg" />;

  return <SyncForm />;
}

type Busy = "idle" | "pushing" | "pulling";

function SyncForm() {
  // Read once after hydration; the form owns the config from here on.
  const [config, setConfig] = useState<SyncConfig>(loadSyncConfig);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState<Busy>("idle");
  const [conflict, setConflict] = useState(false);
  const [confirmingPull, setConfirmingPull] = useState(false);
  const [lastSynced, setLastSynced] = useState<number | null>(
    () => getSyncState().lastSyncedAt,
  );

  const update = (patch: Partial<SyncConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    saveSyncConfig(next);
  };

  const ready = isConfigComplete(config);
  const device = config.device.trim() || "This device";

  function makeTarget() {
    return new GitHubTarget({
      token: config.token.trim(),
      owner: config.owner.trim(),
      repo: config.repo.trim(),
      path: config.path.trim() || undefined,
    });
  }

  /** Turn a sync failure into a message, or open the conflict prompt. */
  function handleError(error: unknown): void {
    if (error instanceof SyncConflictError) {
      setConflict(true);
      return;
    }

    const message =
      error instanceof PassphraseRequiredError ||
      error instanceof DecryptionError ||
      error instanceof SnapshotError ||
      error instanceof SyncAuthError ||
      error instanceof SyncError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Something went wrong.";

    toast.error("Sync failed", { description: message });
  }

  async function push(force: boolean) {
    if (config.encrypt && passphrase.trim() === "") {
      toast.error("Enter the encryption passphrase first");
      return;
    }

    setBusy("pushing");
    setConflict(false);

    try {
      const state = await pushSnapshot(makeTarget(), {
        device,
        passphrase: config.encrypt ? passphrase : undefined,
        force,
      });
      setLastSynced(state.lastSyncedAt);
      toast.success("Uploaded to the cloud");
    } catch (error) {
      handleError(error);
    } finally {
      setBusy("idle");
    }
  }

  async function pull() {
    setBusy("pulling");
    setConflict(false);
    setConfirmingPull(false);

    try {
      const result = await pullSnapshot(
        makeTarget(),
        config.encrypt ? passphrase : undefined,
      );

      if (result.outcome === "empty") {
        toast.info("The cloud has no snapshot yet");
      } else {
        setLastSynced(result.state.lastSyncedAt);
        toast.success("Restored from the cloud");
      }
    } catch (error) {
      handleError(error);
    } finally {
      setBusy("idle");
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-medium">Sync across devices</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Store a snapshot of your database in a private GitHub repository. Your
          other devices read the same repository. Nothing is run by anyone else —
          the repository is the whole backend.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="GitHub token" hint="Fine-grained, with contents read/write on the repo.">
          <Input
            type="password"
            value={config.token}
            onChange={(event) => update({ token: event.target.value })}
            placeholder="github_pat_…"
            autoComplete="off"
          />
        </Field>

        <Field label="Owner">
          <Input
            value={config.owner}
            onChange={(event) => update({ owner: event.target.value })}
            placeholder="your-github-username"
          />
        </Field>

        <Field label="Repository">
          <Input
            value={config.repo}
            onChange={(event) => update({ repo: event.target.value })}
            placeholder="chessvault-data"
          />
        </Field>

        <Field label="This device's name">
          <Input
            value={config.device}
            onChange={(event) => update({ device: event.target.value })}
            placeholder="Laptop"
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={config.encrypt}
          onChange={(event) => update({ encrypt: event.target.checked })}
        />
        Encrypt the snapshot with a passphrase
      </label>

      {config.encrypt ? (
        <Field
          label="Passphrase"
          hint="Never stored. Enter it each session. Lose it and the snapshot cannot be restored."
        >
          <Input
            type="password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            placeholder="A phrase only you know"
            autoComplete="off"
          />
        </Field>
      ) : null}

      {conflict ? (
        <div className="border-destructive/40 bg-destructive/5 flex flex-col gap-2 rounded-md border p-3 text-sm">
          <p>
            The cloud copy changed since this device last synced — another device
            wrote to it. Choose which one wins:
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="destructive" onClick={() => void push(true)}>
              Overwrite cloud with this device
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmingPull(true)}>
              Load the cloud copy instead
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConflict(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {confirmingPull ? (
        <div className="border-border bg-muted/40 flex flex-col gap-2 rounded-md border p-3 text-sm">
          <p>
            Loading the cloud copy <span className="font-medium">replaces everything</span>{" "}
            currently on this device. This cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={() => void pull()}>
              Replace this device
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmingPull(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button className="gap-2" disabled={!ready || busy !== "idle"} onClick={() => void push(false)}>
          {busy === "pushing" ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
          Upload to cloud
        </Button>
        <Button
          variant="outline"
          className="gap-2"
          disabled={!ready || busy !== "idle"}
          onClick={() => setConfirmingPull(true)}
        >
          {busy === "pulling" ? <Loader2 className="size-4 animate-spin" /> : <CloudDownload className="size-4" />}
          Restore from cloud
        </Button>

        {lastSynced ? (
          <span className="text-muted-foreground text-sm">
            Last synced {new Date(lastSynced).toLocaleString()}
          </span>
        ) : null}
      </div>

      {!ready ? (
        <p className="text-muted-foreground text-xs">
          Enter a token, owner and repository to enable syncing.
        </p>
      ) : null}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
    </label>
  );
}
