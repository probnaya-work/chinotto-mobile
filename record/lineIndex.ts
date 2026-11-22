/**
 * The derived index that lets a Line be ordered without walking edges.
 *
 * `line_index` is a pure function of `continuations` and holds nothing a person decided, so
 * it may be dropped and rebuilt at any time. It exists only so the record can ask "is this
 * moment part of a line, and how long is it" without a recursive query per row at fifty
 * thousand fragments.
 *
 * `continuations.fragment_id` is a primary key, so each fragment continues at most one
 * earlier fragment. Multiple devices can continue the same parent; all branches belong
 * to its Line. The walk guards against a cycle: a corrupted edge set must not hang the app.
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
  const continuedBy = new Map<string, string[]>();
  for (const e of edges) {
    continues.set(e.fragment_id, e.continues_id);
    const children = continuedBy.get(e.continues_id) ?? [];
    children.push(e.fragment_id);
    continuedBy.set(e.continues_id, children);
  }

  // A root is anything that continues nothing but is continued by something.
  const roots: string[] = [];
  for (const id of continuedBy.keys()) {
    if (!continues.has(id)) roots.push(id);
  }

  const rows: { id: string; root: string; position: number; length: number }[] = [];
  const placed = new Set<string>();
  for (const children of continuedBy.values()) children.sort();
  roots.sort();

  for (const root of roots) {
    const chain: string[] = [];
    const stack = [root];
    // Two offline devices may both continue the same moment. Both belong to its Line.
    while (stack.length) {
      const cursor = stack.pop()!;
      if (placed.has(cursor)) continue;
      chain.push(cursor);
      placed.add(cursor);
      stack.push(...[...(continuedBy.get(cursor) ?? [])].reverse());
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
