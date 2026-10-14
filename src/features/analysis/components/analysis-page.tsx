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

  // Optional: where in the game to open, for links to a position in it.
  const ply = Number(searchParams.get("ply"));

  return (
    <AnalysisView
      // Keyed by game and ply, so following a link to another position in the
      // same game moves there instead of keeping the current one.
      key={`${parsed}:${searchParams.get("ply") ?? ""}`}
      gameId={parsed}
      initialPly={Number.isInteger(ply) && ply > 0 ? ply : 0}
    />
  );
}
