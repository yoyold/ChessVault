import type { ReactNode } from "react";
import type { Breakdown } from "@/core/statistics/statistics";
import { OutcomeBar, OutcomeCounts, ScorePercent } from "@/components/outcome-bar";
import { cn } from "@/lib/utils";

export interface BreakdownRow {
  key: string;
  label: ReactNode;
  breakdown: Breakdown;
}

export interface ExtraColumn<Row extends BreakdownRow> {
  header: string;
  /** Explains the column on hover, for headers that have to stay short. */
  hint?: string;
  render: (row: Row) => ReactNode;
}

/**
 * Groups of games side by side: how many, how they went, what they scored.
 *
 * A table rather than a chart, because the groups are many and each carries
 * meaning — openings, years, tournaments. The bar is there to be compared down
 * the column at a glance; the figures beside it are what is actually read, and
 * are the whole record for anyone the colours do not work for.
 *
 * On a phone the game count and any extra columns step aside, leaving the
 * label, the record and the score.
 */
export function BreakdownTable<Row extends BreakdownRow>({
  rows,
  labelHeader,
  extra = [],
}: {
  rows: readonly Row[];
  labelHeader: string;
  extra?: readonly ExtraColumn<Row>[];
}) {
  return (
    <table className="w-full table-fixed text-sm">
      <colgroup>
        <col className="w-[34%] sm:w-[30%]" />
        <col className="hidden w-14 sm:table-column" />
        <col />
        <col className="w-16" />
        <col className="w-12" />
        {extra.map((column) => (
          <col key={column.header} className="hidden w-20 sm:table-column" />
        ))}
      </colgroup>

      <thead>
        <tr className="text-muted-foreground text-left text-xs">
          <th className="pb-2 font-normal">{labelHeader}</th>
          <th className="hidden pb-2 text-right font-normal sm:table-cell">Games</th>
          <th className="pb-2 pl-3 font-normal">Record</th>
          <th className="pb-2 text-right font-normal" title="Won, drawn, lost">
            W–D–L
          </th>
          <th className="pb-2 text-right font-normal" title="Share of the available points">
            Score
          </th>
          {extra.map((column) => (
            <th
              key={column.header}
              className="hidden pb-2 text-right font-normal sm:table-cell"
              title={column.hint}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-t">
            <td className="truncate py-2 pr-2">{row.label}</td>
            <td className="hidden py-2 text-right tabular-nums sm:table-cell">
              {row.breakdown.tally.games}
            </td>
            <td className="py-2 pl-3">
              <OutcomeBar tally={row.breakdown.tally} />
            </td>
            <td className="py-2 text-right">
              <OutcomeCounts tally={row.breakdown.tally} />
            </td>
            <td className="py-2 text-right">
              <ScorePercent tally={row.breakdown.tally} />
            </td>
            {extra.map((column) => (
              <td
                key={column.header}
                className={cn("hidden py-2 text-right tabular-nums sm:table-cell")}
              >
                {column.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
