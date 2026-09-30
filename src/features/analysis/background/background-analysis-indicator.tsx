"use client";

import Link from "next/link";
import { Loader2, Pause } from "lucide-react";
import { useBackgroundAnalysis } from "./analysis-provider";

/**
 * A quiet sign in the header that the collection is being analysed.
 *
 * The job keeps running while the user moves between pages, and something
 * using the processor in the background should not be invisible. Shown only
 * while a run is going; it links to the controls to pause it.
 */
export function BackgroundAnalysisIndicator() {
  const { state } = useBackgroundAnalysis();

  if (state.status !== "running" && state.status !== "yielding") return null;

  const waiting = state.status === "yielding";
  const summary = `${state.analysed} of ${state.total} games analysed${waiting ? ", waiting while you analyse" : ""}`;

  return (
    <Link
      href="/statistics/#move-quality"
      className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-md px-2 py-1 text-xs tabular-nums"
      title={summary}
      aria-label={`Background analysis: ${summary}`}
    >
      {waiting ? (
        <Pause className="size-3.5" />
      ) : (
        <Loader2 className="size-3.5 animate-spin" />
      )}
      <span className="hidden sm:inline">
        {state.analysed}/{state.total}
      </span>
    </Link>
  );
}
