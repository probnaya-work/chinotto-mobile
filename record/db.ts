/**
 * The narrow database surface the Record depends on.
 *
 * Structurally a subset of expo-sqlite's `SQLiteDatabase`, so the real database satisfies it
 * without an adapter. Declared separately so the domain and the migrations can be exercised
 * against a real SQLite engine in Node (see `record/__testsupport__/nodeSqliteDb.ts`) rather
 * than against a hand-rolled fake that cannot enforce a CHECK constraint or a foreign key.
 */
export type RecordRunResult = {
  lastInsertRowId: number;
  changes: number;
};

export type RecordDb = {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: unknown[]): Promise<RecordRunResult>;
  getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
};

/** Reads `PRAGMA user_version`. Returns 0 for a database that has never been migrated. */
export async function userVersion(db: RecordDb): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/** Sets `PRAGMA user_version`. PRAGMA does not accept bound parameters. */
export async function setUserVersion(db: RecordDb, version: number): Promise<void> {
  if (!Number.isInteger(version) || version < 0) {
    throw new Error(`[Record] refusing to set a non-integer user_version: ${version}`);
  }
  await db.execAsync(`PRAGMA user_version = ${version}`);
}

/** True when a table (or virtual table) of this name exists. */
export async function tableExists(db: RecordDb, name: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type IN ('table','view') AND name = ?",
    name
  );
  return (row?.n ?? 0) > 0;
}

/** True when `table` exists and carries a column of this name. */
export async function columnExists(db: RecordDb, table: string, column: string): Promise<boolean> {
  if (!(await tableExists(db, table))) {
    return false;
  }
  const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return cols.some((c) => c.name === column);
}
