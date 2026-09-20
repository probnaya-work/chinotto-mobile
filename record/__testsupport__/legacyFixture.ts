/**
 * TEST SUPPORT ONLY.
 *
 * Builds a v1 mobile database that looks like a phone someone has actually used: years of
 * entries at an uneven rate, long bodies, URLs, quotes, unicode, whitespace-only rows that
 * v1 allowed in, user-authored themes with classifications, engagement counts, and sync
 * outbox rows mid-flight.
 *
 * Hostile on purpose. A migration that only works on tidy data is not a migration.
 */

import { LEGACY_V1_SCHEMA_SQL } from '../migrate';
import { openTestDb, type TestDb } from './nodeSqliteDb';

const POOL = [
  'tomatoes, bread, the cheap olive oil, batteries AA',
  'why does every app want me to name the thing first',
  '“folder” is such a physical word for something that isn’t',
  'the sea was the colour of a bruise. not a nice one',
  'ferry back is 16:40 not 16:00',
  'a tag is a folder that’s embarrassed about it',
  'filing feels like work and isn’t',
  'sorting is procrastination with a clear conscience',
  'quiet',
  'no',
  'ok',
  'M was right about the soup 🍲',
  'дентист в четверг в 9:15',
  'the moment I name a thing I stop looking at it',
];

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type LegacyFixtureOptions = {
  /** Roughly how many entries to lay down across the span. */
  entries?: number;
  /** End of the span. Defaults to 19 sep 2026, the prototype's "now". */
  now?: number;
  seed?: number;
  file?: string;
};

export type LegacyFixture = {
  db: TestDb;
  /** Rows written to `entries`, including the ones a migration must skip. */
  totalEntries: number;
  /** Rows with non-blank text — what `fragments` should end up holding. */
  materialEntries: number;
  /** Ids of rows whose text is blank or whitespace only. */
  blankIds: string[];
  /** Id of the row carrying a very long body. */
  longId: string;
  /** Id of the row that is a bare URL. */
  urlId: string;
  /** Ids that carry an `entry_engagement.edit_count > 0`. */
  editedIds: string[];
};

/** Creates a v1 database at `user_version = 0`, exactly as the shipped app leaves it. */
export function buildLegacyFixture(opts: LegacyFixtureOptions = {}): LegacyFixture {
  const {
    entries = 2000,
    now = new Date(2026, 8, 19, 17, 10).getTime(),
    seed = 7,
    file = ':memory:',
  } = opts;

  const db = openTestDb(file);
  db.raw.exec(LEGACY_V1_SCHEMA_SQL);
  // The shipped app leaves user_version at 0; the ladder must cope with that.
  db.raw.exec('PRAGMA user_version = 0');

  const r = rng(seed);
  const span = 6 * 365 * 864e5;
  const insert = db.raw.prepare('INSERT INTO entries (id, text, created_at) VALUES (?, ?, ?)');

  let n = 0;
  const blankIds: string[] = [];
  const editedIds: string[] = [];

  for (let i = 0; i < entries; i += 1) {
    const at = now - Math.floor(r() * span);
    const id = `legacy-${i}`;
    let text = POOL[Math.floor(r() * POOL.length)];
    // v1 had no NOT NULL-ish guard on content: blank rows exist in the wild.
    if (i % 137 === 0) {
      text = i % 274 === 0 ? '' : '   \n\t  ';
      blankIds.push(id);
    }
    insert.run(id, text, new Date(at).toISOString());
    n += 1;
  }

  // A body long enough to be hostile to layout, clamping and FTS alike.
  const longId = 'legacy-long';
  const longBody = Array.from(
    { length: 400 },
    (_, i) => `paragraph ${i}: ${POOL[i % POOL.length]}`
  ).join('\n\n');
  insert.run(longId, longBody, new Date(now - 3 * 864e5).toISOString());
  n += 1;

  // A bare URL — v1 stored it as text and knew nothing about it.
  const urlId = 'legacy-url';
  insert.run(
    urlId,
    'https://www.theatlantic.com/ideas/archive/2026/09/second-brain-apps/?utm_source=feed',
    new Date(now - 5 * 864e5).toISOString()
  );
  n += 1;

  // Themes: user-authored labels and per-entry classifications. This is user material.
  db.raw.exec(`
    CREATE TABLE IF NOT EXISTS user_themes (
      id TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL, keywords TEXT NOT NULL,
      sort_order INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entry_themes (
      entry_id TEXT PRIMARY KEY NOT NULL, theme_id TEXT NOT NULL, confidence REAL NOT NULL,
      source TEXT NOT NULL, locked INTEGER NOT NULL DEFAULT 0, classified_at TEXT NOT NULL
    );
  `);
  const themes = [
    ['book', 'Book', '["attention","essay","draft"]', 1],
    ['therapy', 'Therapy', '["k said","sleep"]', 2],
    ['flat', 'The flat 🏠', '["boiler","deposit","radiator"]', 3],
  ] as const;
  const themeIns = db.raw.prepare(
    'INSERT INTO user_themes (id, label, keywords, sort_order, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  for (const [id, label, keywords, order] of themes) {
    themeIns.run(id, label, keywords, order, new Date(now - span).toISOString());
  }
  const clsIns = db.raw.prepare(
    'INSERT INTO entry_themes (entry_id, theme_id, confidence, source, locked, classified_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (let i = 0; i < 120; i += 1) {
    clsIns.run(
      `legacy-${i}`,
      themes[i % themes.length][0],
      0.4 + (i % 6) / 10,
      i % 3 === 0 ? 'manual' : 'auto',
      i % 5 === 0 ? 1 : 0,
      new Date(now - i * 864e5).toISOString()
    );
  }

  // Engagement: v1's own count of destructive in-place edits.
  const engIns = db.raw.prepare(
    'INSERT INTO entry_engagement (entry_id, open_count, edit_count, last_opened_at, last_edited_at) VALUES (?, ?, ?, ?, ?)'
  );
  for (let i = 0; i < 60; i += 1) {
    const id = `legacy-${i * 7}`;
    const edits = (i % 4) + 1;
    engIns.run(id, i, edits, new Date(now - i * 3600e3).toISOString(), new Date(now).toISOString());
    editedIds.push(id);
  }

  // Sync mid-flight: a queue with pending work and a tombstone that has not gone out.
  db.raw
    .prepare('INSERT INTO sync_queue (id, payload, status) VALUES (?, ?, ?)')
    .run('legacy-1', JSON.stringify({ id: 'legacy-1' }), 'pending');
  db.raw
    .prepare('INSERT INTO sync_tombstone_outbox (entry_id, enqueued_at) VALUES (?, ?)')
    .run('legacy-2', new Date(now).toISOString());
  db.raw
    .prepare('INSERT INTO firestore_ingest_suppressed_ids (id, suppressed_at) VALUES (?, ?)')
    .run('legacy-3', new Date(now).toISOString());

  const material = n - blankIds.length;
  return {
    db,
    totalEntries: n,
    materialEntries: material,
    blankIds,
    longId,
    urlId,
    editedIds,
  };
}
