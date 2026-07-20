"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnalysisView } from "./analysis-view";

/**
 * Resolves which game to analyse from the URL.
 *
 * Like the game browser, the selection lives in a search parameter because
 * static export cannot generate a route per game. See ADR 0001.
 */
export function AnalysisPage() {
  const searchParams = useSearchParams();

  const raw = searchParams.get("game");
  const parsed = raw === null ? Number.NaN : Number(raw);

  if (!Number.isInteger(parsed)) {
    return (
      <p className="text-muted-foreground text-sm">
        Choose a game from the{" "}
        <Link href="/games/" className="underline underline-offset-4">
          games list
        </Link>{" "}
        to analyse it.
      </p>
    );
  }

  return <AnalysisView gameId={parsed} />;
}
