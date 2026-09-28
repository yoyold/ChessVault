import Dexie from "dexie";
import { ChessVaultDatabase } from "./db";

/** Rows per table, keyed by table name, as a snapshot carries them. */
export type TableRows = Record<string, readonly unknown[]>;

/**
 * Carry rows written under an older schema forward to the current one.
 *
 * A backup has to outlive the version of the app that wrote it; otherwise every
 * schema change would quietly turn every backup into a file that can no longer
 * be restored. The rows cannot simply be written into today's tables, because
 * the upgrade functions that reshaped the live database in the meantime never
 * ran on them.
 *
 * So they take the same path a real database took. A throwaway database is
 * created exactly as the older version declared it, the rows go in, and it is
 * then reopened under the current schema — which runs every upgrade function
 * between the two, the very code that migrated everyone's live data. Reading
 * the result back gives rows in today's shape.
 *
 * Nothing here touches the live database. Replacing it is left to the caller,
 * which can then do it in one transaction with rows already known to be good.
 *
 * @param fromVersion The schema version the rows were written under.
 * @returns Every current table's rows, keyed by table name.
 */
export async function upgradeRows(
  rows: TableRows,
  fromVersion: number,
): Promise<Record<string, unknown[]>> {
  // Unique per call, so two restores in flight — or a stale database left by a
  // crash — can never share a staging area.
  const name = `chessvault-upgrade-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try {
    const staged = new ChessVaultDatabase(name, { upToVersion: fromVersion });

    try {
      await staged.transaction("rw", staged.tables, async () => {
        for (const table of staged.tables) {
          const tableRows = rows[table.name];
          if (tableRows && tableRows.length > 0) await table.bulkAdd([...tableRows]);
        }
      });
    } finally {
      staged.close();
    }

    const upgraded = new ChessVaultDatabase(name);

    try {
      // Opening under the full schema is what runs the upgrades.
      await upgraded.open();

      const result: Record<string, unknown[]> = {};
      await upgraded.transaction("r", upgraded.tables, async () => {
        for (const table of upgraded.tables) result[table.name] = await table.toArray();
      });

      return result;
    } finally {
      upgraded.close();
    }
  } finally {
    await Dexie.delete(name);
  }
}
