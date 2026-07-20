/**
 * Convert a PGN `Date` tag into a sortable `YYYY-MM-DD` string.
 *
 * PGN dates are `YYYY.MM.DD` with `?` for unknown components, and partial dates
 * are common in real archives — tournament collections frequently know only the
 * year. Unknown or invalid components are zero-filled to `01` so the result
 * stays lexicographically sortable and usable in an IndexedDB range query.
 *
 * That zero-filling loses information, which is why the raw tag is kept in the
 * game's `headers`: this projection exists for querying, the header for truth.
 *
 * Returns null when the year is unknown, since a date with no year cannot be
 * ordered meaningfully and a fabricated one would sort into a real range.
 */
export function normalisePgnDate(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // Accept `.` and `-` separators: exporters disagree, and both appear in the wild.
  const [yearPart, monthPart, dayPart] = raw.trim().split(/[.\-/]/);

  if (!/^\d{4}$/.test(yearPart ?? "")) return null;

  const month = clampComponent(monthPart, 1, 12);
  const day = clampComponent(dayPart, 1, 31);

  return `${yearPart}-${month}-${day}`;
}

/** Parse a component, falling back to `01` when unknown or out of range. */
function clampComponent(part: string | undefined, min: number, max: number): string {
  const value = Number(part);

  if (!Number.isInteger(value) || value < min || value > max) return "01";

  return String(value).padStart(2, "0");
}
