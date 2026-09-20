/**
 * The derived index that lets a Line be ordered without walking edges.
 *
 * `line_index` is a pure function of `continuations` and holds nothing a person decided, so
 * it may be dropped and rebuilt at any time. It exists only so the record can ask "is this
 * moment part of a line, and how long is it" without a recursive query per row at fifty
 * thousand fragments.
 *
 * `continuations.fragment_id` is a primary key, so each fragment continues at most one
 * earlier fragment and the closure is always a chain. The walk below relies on that, and
 * guards against a cycle anyway: a corrupted edge set must not hang the app.
 */

import type { RecordDb } from './db';

type Edge = { fragment_id: string; continues_id: string };

/**
 * Recomputes the whole index. Cheap enough to do on every structural change at the sizes a
 * phone sees, and the only way to be certain the cache agrees with the edges.
 */
export async function rebuildLineIndex(db: RecordDb): Promise<void> {
  const edges = await db.getAllAsync<Edge>(
    'SELECT fragment_id, continues_id FROM continuations'
  );
  await db.execAsync('DELETE FROM line_index');
  if (edges.length === 0) return;

  // later -> earlier, and the reverse
  const continues = new Map<string, string>();
  const continuedBy = new Map<string, string>();
  for (const e of edges) {
    continues.set(e.fragment_id, e.continues_id);
    continuedBy.set(e.continues_id, e.fragment_id);
  }

  // A root is anything that continues nothing but is continued by something.
  const roots: string[] = [];
  for (const id of continuedBy.keys()) {
    if (!continues.has(id)) roots.push(id);
  }

  const rows: { id: string; root: string; position: number; length: number }[] = [];
  const placed = new Set<string>();

  for (const root of roots) {
    const chain: string[] = [];
    let cursor: string | undefined = root;
    // The guard is the chain length, not a visited set, so a cycle terminates rather than
    // spinning. A cycle cannot be produced by the product, only by corruption.
    while (cursor && !placed.has(cursor) && chain.length <= edges.length + 1) {
      chain.push(cursor);
      placed.add(cursor);
      cursor = continuedBy.get(cursor);
    }
    chain.forEach((id, position) => {
      rows.push({ id, root, position, length: chain.length });
    });
  }

  for (const r of rows) {
    await db.runAsync(
      'INSERT OR REPLACE INTO line_index (fragment_id, root_id, position, line_length) VALUES (?, ?, ?, ?)',
      r.id,
      r.root,
      r.position,
      r.length
    );
  }
}

/** The root of the line a fragment belongs to, or null when it stands alone. */
export async function lineRootOf(db: RecordDb, fragmentId: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ root_id: string }>(
    'SELECT root_id FROM line_index WHERE fragment_id = ?',
    fragmentId
  );
  return row?.root_id ?? null;
}
