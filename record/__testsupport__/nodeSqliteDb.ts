/**
 * TEST SUPPORT ONLY — never imported by product code.
 *
 * A real SQLite engine behind the `RecordDb` interface, so migrations, CHECK constraints,
 * foreign keys and FTS5 are exercised for real rather than against a hand-rolled fake. The
 * existing `storage/__tests__` fakes cannot fail a CHECK or cascade a delete, which is
 * precisely what the Record's invariants depend on.
 *
 * `node:sqlite` is behind an experimental flag in Node but ships in the runtime Jest already
 * uses here, and nothing about it reaches the app bundle.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

import type { RecordDb, RecordRunResult } from '../db';

type Raw = InstanceType<typeof DatabaseSync>;

/** node:sqlite rejects booleans and undefined; SQLite has neither. */
function bind(params: unknown[]): unknown[] {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

export type TestDb = RecordDb & {
  /** The underlying handle, for assertions that want raw access. */
  raw: Raw;
  close(): void;
};

export function openTestDb(file = ':memory:'): TestDb {
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA foreign_keys = ON');

  let depth = 0;

  const db: TestDb = {
    raw,
    close: () => raw.close(),

    async execAsync(source: string) {
      raw.exec(source);
    },

    async runAsync(source: string, ...params: unknown[]): Promise<RecordRunResult> {
      const r = raw.prepare(source).run(...(bind(params) as never[]));
      return {
        lastInsertRowId: Number(r.lastInsertRowid ?? 0),
        changes: Number(r.changes ?? 0),
      };
    },

    async getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
      const row = raw.prepare(source).get(...(bind(params) as never[]));
      return (row as T) ?? null;
    },

    async getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]> {
      return raw.prepare(source).all(...(bind(params) as never[])) as T[];
    },

    /**
     * Nested calls join the outer transaction rather than opening a second one, which is
     * what expo-sqlite does and what the migration ladder assumes.
     */
    async withTransactionAsync(task: () => Promise<void>) {
      if (depth > 0) {
        depth += 1;
        try {
          await task();
        } finally {
          depth -= 1;
        }
        return;
      }
      depth = 1;
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (err) {
        try {
          raw.exec('ROLLBACK');
        } catch {
          /* the transaction was already gone */
        }
        throw err;
      } finally {
        depth = 0;
      }
    },
  };

  return db;
}
