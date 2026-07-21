"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { GameDetailsForm } from "@/features/games/edit/game-details-form";

interface EditDetailsDialogProps {
  headers: Record<string, string>;
  onSave: (headers: Record<string, string>) => void;
}

/**
 * Edit a game's tag pairs.
 *
 * The dialog works on a copy and only reports back on save, so cancelling
 * leaves the game exactly as it was — including after several changes, which a
 * form editing the game directly could not offer.
 */
export function EditDetailsDialog({ headers, onSave }: EditDetailsDialogProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(headers);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Re-seed on each opening so a cancelled edit is not still sitting
        // there the next time the dialog appears.
        if (next) setDraft(headers);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0 gap-2">
          <Pencil className="size-4" />
          Details
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85svh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Game details</DialogTitle>
          <DialogDescription>
            Players, ratings, tournament and result. Other tags in the file are
            left untouched.
          </DialogDescription>
        </DialogHeader>

        <GameDetailsForm headers={draft} onChange={setDraft} />

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(draft);
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
