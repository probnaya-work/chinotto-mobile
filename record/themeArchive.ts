/**
 * Retiring recall themes without losing what people wrote.
 *
 * v1's themes were user material: someone typed the labels and the keywords, and the
 * classifications record which moment they thought belonged where. The Record has no themes
 * and no classification, and it never will — but a product changing its mind is not a reason
 * to destroy words. So before the concept is retired, the material is written out twice:
 *
 *   1. into `archived_material`, inside the database, where it cannot fail; and
 *   2. into a readable file in the app's document directory, when a filesystem is available.
 *
 * (1) is the guarantee. (2) is the convenience, and it is allowed to fail — a full or
 * read-only volume leaves the archive `owed-file`, and the next boot tries again.
 *
 * Note also that the v1 `user_themes` and `entry_themes` tables are NOT dropped by any of
 * this. They stay until the deployed transition is over, so reverting the binary restores
 * the old behaviour exactly.
 */

import { getMeta, setMeta } from './migrate';
import type { RecordDb } from './db';

/** Writes `contents` and resolves to where it landed. Injected so tests need no filesystem. */
export type ArchiveFileWriter = (fileName: string, contents: string) => Promise<string>;

export type ThemeArchiveResult =
  | { state: 'not-needed' }
  | { state: 'already-archived'; filePath: string | null }
  | { state: 'archived'; themes: number; classifications: number; filePath: string | null };

type ThemeRow = {
  id: string;
  label: string;
  keywords: string;
  sort_order: number;
  created_at: string;
};

type ClassificationRow = {
  entry_id: string;
  theme_id: string;
  confidence: number;
  source: string;
  locked: number;
  classified_at: string;
  text: string | null;
};

const ARCHIVE_ID = 'themes';
const ARCHIVE_FILE = 'chinotto-themes-archive.txt';

/**
 * Writes the archive if the migration ladder said one was owed. Safe to call on every boot:
 * it is a no-op once the material is in `archived_material` and a file has been written.
 */
export async function archiveThemesIfNeeded(
  db: RecordDb,
  options: { writeFile?: ArchiveFileWriter; now?: () => Date } = {}
): Promise<ThemeArchiveResult> {
  const state = await getMeta(db, 'themes.archive');
  if (state === 'not-needed' || state === null) {
    return { state: 'not-needed' };
  }

  const existing = await db.getFirstAsync<{ file_path: string | null }>(
    'SELECT file_path FROM archived_material WHERE id = ?',
    ARCHIVE_ID
  );

  // The material is already safe; only the readable copy may still be owed.
  if (existing && state === 'done') {
    return { state: 'already-archived', filePath: existing.file_path };
  }

  const now = (options.now ?? (() => new Date()))();
  const themes = await db.getAllAsync<ThemeRow>(
    'SELECT id, label, keywords, sort_order, created_at FROM user_themes ORDER BY sort_order, created_at'
  );
  const classifications = await db.getAllAsync<ClassificationRow>(
    `SELECT t.entry_id, t.theme_id, t.confidence, t.source, t.locked, t.classified_at, e.text
       FROM entry_themes t
       LEFT JOIN entries e ON e.id = t.entry_id
      ORDER BY t.classified_at DESC`
  );

  const body = renderArchive(themes, classifications, now);

  if (!existing) {
    await db.runAsync(
      'INSERT INTO archived_material (id, kind, archived_at, body, file_path) VALUES (?, ?, ?, ?, NULL)',
      ARCHIVE_ID,
      'themes',
      now.toISOString(),
      body
    );
  }

  // Only now, with the material durable, try for the readable file.
  let filePath: string | null = existing?.file_path ?? null;
  if (!filePath && options.writeFile) {
    try {
      filePath = await options.writeFile(ARCHIVE_FILE, body);
      await db.runAsync('UPDATE archived_material SET file_path = ? WHERE id = ?', filePath, ARCHIVE_ID);
    } catch {
      // The database copy stands. Leave the archive owed so the next boot tries again.
      filePath = null;
    }
  }

  await setMeta(db, 'themes.archive', filePath ? 'done' : 'owed-file');

  return {
    state: 'archived',
    themes: themes.length,
    classifications: classifications.length,
    filePath,
  };
}

/** Reads the archived material back, for an export surface or for support. */
export async function readThemeArchive(
  db: RecordDb
): Promise<{ body: string; archivedAt: string; filePath: string | null } | null> {
  const row = await db.getFirstAsync<{
    body: string;
    archived_at: string;
    file_path: string | null;
  }>('SELECT body, archived_at, file_path FROM archived_material WHERE id = ?', ARCHIVE_ID);
  if (!row) return null;
  return { body: row.body, archivedAt: row.archived_at, filePath: row.file_path };
}

function parseKeywords(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Plain text, self-describing, and readable by anything. One file rather than one per theme,
 * for the same reason desktop's export is one file: the argument for an archive is that it
 * outlives the program, and a directory of fragments is harder to read with other tools.
 */
function renderArchive(
  themes: ThemeRow[],
  classifications: ClassificationRow[],
  now: Date
): string {
  const byTheme = new Map<string, ClassificationRow[]>();
  for (const c of classifications) {
    const list = byTheme.get(c.theme_id) ?? [];
    list.push(c);
    byTheme.set(c.theme_id, list);
  }

  const out: string[] = [];
  out.push('chinotto — recall themes, archived');
  out.push('');
  out.push(
    'Chinotto no longer has themes. This file is everything the old feature held that you'
  );
  out.push(
    'wrote yourself: the themes you made, and which moments had been filed under each one.'
  );
  out.push('Nothing in your record was changed or removed. Every moment is still there.');
  out.push('');
  out.push(`archived ${now.toISOString()}`);
  out.push(`${themes.length} themes · ${classifications.length} classified moments`);
  out.push('');

  if (themes.length === 0) {
    out.push('(no themes)');
  }

  for (const theme of themes) {
    const keywords = parseKeywords(theme.keywords);
    const rows = byTheme.get(theme.id) ?? [];
    out.push('----------------------------------------------------------------------');
    out.push(theme.label);
    out.push(`  id       ${theme.id}`);
    out.push(`  made     ${theme.created_at}`);
    out.push(`  keywords ${keywords.length ? keywords.join(', ') : '(none)'}`);
    out.push(`  moments  ${rows.length}`);
    out.push('');
    for (const row of rows) {
      const when = row.classified_at;
      const how = row.source === 'manual' ? 'you filed it' : 'chinotto guessed';
      const locked = row.locked ? ' · locked' : '';
      const text = (row.text ?? '(this moment is no longer in the record)')
        .replace(/\s+/g, ' ')
        .trim();
      out.push(`  · ${when} · ${how}${locked}`);
      out.push(`    ${text}`);
    }
    if (rows.length) out.push('');
  }

  // A classification whose theme row is gone would otherwise vanish silently.
  const known = new Set(themes.map((t) => t.id));
  const orphaned = classifications.filter((c) => !known.has(c.theme_id));
  if (orphaned.length) {
    out.push('----------------------------------------------------------------------');
    out.push(`filed under a theme that is no longer here (${orphaned.length})`);
    out.push('');
    for (const row of orphaned) {
      const text = (row.text ?? '(this moment is no longer in the record)')
        .replace(/\s+/g, ' ')
        .trim();
      out.push(`  · ${row.classified_at} · theme ${row.theme_id}`);
      out.push(`    ${text}`);
    }
  }

  return out.join('\n') + '\n';
}
