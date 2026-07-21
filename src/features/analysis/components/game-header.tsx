"use client";

import type { GameRecord } from "@/core/domain/game";
import { ResultBadge } from "@/components/result-badge";

/**
 * Who played, at what strength, where and how it ended.
 *
 * Present on the analysis page because a position means little without knowing
 * whose game it is: the same mistake reads differently against someone rated
 * four hundred points above you than below.
 */
export function GameHeader({ game }: { game: GameRecord }) {
  const details = [
    game.event,
    game.round ? `Round ${game.round}` : null,
    game.site,
    game.dateIso === "" ? null : game.dateIso,
    game.timeControl,
    [game.eco, game.opening].filter(Boolean).join(" ") || null,
  ].filter((value): value is string => Boolean(value));

  return (
    <header className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Player
          name={game.white}
          elo={game.whiteElo}
          isOwner={game.playerColor === "white"}
        />
        <span className="text-muted-foreground">vs</span>
        <Player
          name={game.black}
          elo={game.blackElo}
          isOwner={game.playerColor === "black"}
        />

        <ResultBadge
          result={game.result}
          playerColor={game.playerColor}
          className="ml-1"
        />
      </div>

      {details.length > 0 ? (
        <p className="text-muted-foreground text-sm">{details.join(" · ")}</p>
      ) : null}
    </header>
  );
}

function Player({
  name,
  elo,
  isOwner,
}: {
  name: string;
  elo: number | null;
  isOwner: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1">
      {/* The owner is marked so it is obvious at a glance which side is yours. */}
      <span className={isOwner ? "font-semibold underline underline-offset-4" : "font-medium"}>
        {name || "?"}
      </span>
      {elo ? <span className="text-muted-foreground text-sm tabular-nums">{elo}</span> : null}
    </span>
  );
}
