"use client";

import { useState } from "react";
import type { AccuracyStatistics, MoveAccuracy } from "@/core/statistics/accuracy";
import { Button } from "@/components/ui/button";
import { BackgroundAnalysisPanel } from "@/features/analysis/background/background-analysis-panel";

const PREVIEW_ROWS = 10;

function perGame(count: number, games: number): string {
  return games === 0 ? "—" : (count / games).toFixed(1);
}

function Tile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="bg-card flex flex-col gap-1 rounded-lg border p-4">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-3xl font-semibold">{value}</span>
      <span className="text-muted-foreground text-xs">{detail}</span>
    </div>
  );
}

/** Headers and cells shared by the tables in this section. */
const TH = "text-muted-foreground pb-2 text-right text-xs font-normal";
const TD = "py-2 text-right tabular-nums";

function AccuracyCells({ accuracy }: { accuracy: MoveAccuracy }) {
  return (
    <>
      <td className={`${TD} hidden sm:table-cell`}>{accuracy.games}</td>
      <td className={TD}>{Math.round(accuracy.averageCentipawnLoss)}</td>
      <td className={TD}>{perGame(accuracy.blunders, accuracy.games)}</td>
      <td className={TD}>{perGame(accuracy.mistakes, accuracy.games)}</td>
    </>
  );
}

/** Column widths shared by the colour and opening tables, so their figures line up. */
function AccuracyColumns() {
  return (
    <colgroup>
      <col className="w-[40%]" />
      <col className="hidden w-14 sm:table-column" />
      <col />
      <col />
      <col />
    </colgroup>
  );
}

function AccuracyHeaders({ first }: { first: string }) {
  return (
    <tr>
      <th className="text-muted-foreground pb-2 text-left text-xs font-normal">{first}</th>
      <th className={`${TH} hidden sm:table-cell`}>Games</th>
      <th className={TH} title="Average centipawn loss per move — lower is better">
        Avg. loss
      </th>
      <th className={TH} title="Blunders per game">
        Blunders
      </th>
      <th className={TH} title="Mistakes per game">
        Mistakes
      </th>
    </tr>
  );
}

/**
 * How well the owner's own moves stood up to the engine.
 *
 * Every figure rests on the games analysed so far, and says how many that is:
 * a blunder rate from six games out of ninety describes those six. The panel
 * that runs the analysis sits here, beside the figures it produces, rather
 * than in some settings page where nobody would connect the two.
 */
export function AccuracySection({ accuracy }: { accuracy: AccuracyStatistics }) {
  const [allOpenings, setAllOpenings] = useState(false);
  const own = accuracy.own;

  const worstBand = Math.max(0, ...accuracy.byMoveNumber.map((row) => row.perHundredMoves ?? 0));
  const openings = allOpenings ? accuracy.openings : accuracy.openings.slice(0, PREVIEW_ROWS);

  return (
    <section id="move-quality" className="flex scroll-mt-24 flex-col gap-3">
      <div>
        <h2 className="font-medium">Move quality</h2>
        <p className="text-muted-foreground text-sm">
          How your own moves compare with the engine&apos;s — your opponents&apos; errors are not counted.
          {own
            ? accuracy.analysed === accuracy.games
              ? ` From all ${accuracy.games.toLocaleString()} games in this period.`
              : ` From ${accuracy.analysed.toLocaleString()} of ${accuracy.games.toLocaleString()} games in this period; the rest are not analysed yet.`
            : ""}
        </p>
      </div>

      <BackgroundAnalysisPanel />

      {own === null ? (
        <p className="text-muted-foreground text-sm">
          None of the games in this period has been analysed yet. Once they are, this shows your
          average loss per move, how often you blunder, at which stage of the game, and in which
          openings.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile
              label="Average loss per move"
              value={`${Math.round(own.averageCentipawnLoss)}`}
              detail="centipawns — lower is better"
            />
            <Tile
              label="Blunders per game"
              value={perGame(own.blunders, own.games)}
              detail={`${own.blunders} in ${own.games} game${own.games === 1 ? "" : "s"}`}
            />
            <Tile
              label="Mistakes per game"
              value={perGame(own.mistakes, own.games)}
              detail={`${own.inaccuracies} inaccuracies besides`}
            />
          </div>

          <table className="w-full table-fixed text-sm">
            <AccuracyColumns />
            <thead>
              <AccuracyHeaders first="Colour" />
            </thead>
            <tbody>
              {(["white", "black"] as const).map((color) => {
                const side = accuracy.byColor[color];
                return (
                  <tr key={color} className="border-t">
                    <td className="py-2">{color === "white" ? "With White" : "With Black"}</td>
                    {side ? (
                      <AccuracyCells accuracy={side} />
                    ) : (
                      <td colSpan={4} className="text-muted-foreground py-2 text-right text-xs">
                        none analysed
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h3 className="mt-2 text-sm font-medium">When in the game</h3>
          <p className="text-muted-foreground -mt-2 text-sm">
            Mistakes and blunders per hundred of your moves, so that long games do not weigh more.
          </p>
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-28" />
              <col />
              <col className="w-14" />
              <col className="hidden w-20 sm:table-column" />
            </colgroup>
            <thead>
              <tr>
                <th className="text-muted-foreground pb-2 text-left text-xs font-normal">Stretch</th>
                <th className="text-muted-foreground pb-2 pl-3 text-left text-xs font-normal">
                  Errors per 100 moves
                </th>
                <th className={TH}>Rate</th>
                <th className={`${TH} hidden sm:table-cell`} title="Your moves played in this stretch">
                  Moves
                </th>
              </tr>
            </thead>
            <tbody>
              {accuracy.byMoveNumber.map((row) => (
                <tr key={row.band} className="border-t">
                  <td className="py-2">{row.label}</td>
                  <td className="py-2 pl-3">
                    {row.perHundredMoves === null ? (
                      <span className="text-muted-foreground text-xs">no moves</span>
                    ) : (
                      // One magnitude, one hue: the bar is the rate, scaled to the
                      // worst stretch, square at the start and rounded at its end.
                      <span
                        className="bg-series-1 block h-3 rounded-r-[4px]"
                        style={{
                          width: `${worstBand === 0 ? 0 : (row.perHundredMoves / worstBand) * 100}%`,
                          minWidth: row.perHundredMoves > 0 ? 3 : 0,
                        }}
                        title={`${row.mistakes} mistake${row.mistakes === 1 ? "" : "s"} and ${row.blunders} blunder${row.blunders === 1 ? "" : "s"} in ${row.moves} moves`}
                      />
                    )}
                  </td>
                  <td className={TD}>
                    {row.perHundredMoves === null ? "—" : row.perHundredMoves.toFixed(1)}
                  </td>
                  <td className={`${TD} hidden sm:table-cell`}>{row.moves}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="mt-2 text-sm font-medium">By opening</h3>
          <table className="w-full table-fixed text-sm">
            <AccuracyColumns />
            <thead>
              <AccuracyHeaders first="Opening" />
            </thead>
            <tbody>
              {openings.map((row) => (
                <tr key={`${row.color}-${row.eco ?? "none"}`} className="border-t">
                  <td className="truncate py-2 pr-2" title={row.name ?? undefined}>
                    <span className="font-medium">{row.eco ?? "No code"}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      {row.color === "white" ? "as White" : "as Black"}
                      {row.name ? ` · ${row.name}` : ""}
                    </span>
                  </td>
                  <AccuracyCells accuracy={row.accuracy} />
                </tr>
              ))}
            </tbody>
          </table>
          {accuracy.openings.length > PREVIEW_ROWS ? (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setAllOpenings(!allOpenings)}
            >
              {allOpenings ? "Show fewer" : `Show all ${accuracy.openings.length}`}
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}
