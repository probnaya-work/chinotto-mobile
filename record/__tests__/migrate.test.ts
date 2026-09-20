import { buildLegacyFixture } from '../__testsupport__/legacyFixture';
import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { tableExists, userVersion } from '../db';
import { getMeta, migrate, TARGET_VERSION } from '../migrate';

describe('the migration ladder', () => {
  it('takes a fresh install straight to the target version', async () => {
    const db = openTestDb();
    const report = await migrate(db);

    expect(report.from).toBe(0);
    expect(report.to).toBe(TARGET_VERSION);
    expect(report.ran).toEqual([1, 2, 3, 4, 5]);
    expect(report.fragmentsImported).toBe(0);
    expect(await userVersion(db)).toBe(TARGET_VERSION);
    db.close();
  });

  it('is idempotent: a second run does nothing at all', async () => {
    const db = openTestDb();
    await migrate(db);
    const second = await migrate(db);

    expect(second.from).toBe(TARGET_VERSION);
    expect(second.ran).toEqual([]);
    db.close();
  });

  it('refuses to touch a database written by a newer build', async () => {
    const db = openTestDb();
    await migrate(db);
    db.raw.exec(`PRAGMA user_version = ${TARGET_VERSION + 1}`);

    await expect(migrate(db)).rejects.toThrow(/newer than this build/);
    db.close();
  });

  describe('against a realistic v1 phone', () => {
    it('imports every entry that carries material, and no blank ones', async () => {
      const fx = buildLegacyFixture({ entries: 2000 });
      const report = await migrate(fx.db);

      expect(report.from).toBe(0);
      expect(report.fragmentsImported).toBe(fx.materialEntries);

      const { n } = (await fx.db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM fragments'
      ))!;
      expect(n).toBe(fx.materialEntries);

      for (const id of fx.blankIds) {
        const row = await fx.db.getFirstAsync('SELECT id FROM fragments WHERE id = ?', id);
        expect(row).toBeNull();
      }
      fx.db.close();
    });

    it('leaves every v1 table in place, untouched', async () => {
      const fx = buildLegacyFixture({ entries: 200 });
      const before = (await fx.db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM entries'
      ))!.n;

      await migrate(fx.db);

      for (const t of [
        'entries',
        'sync_queue',
        'sync_tombstone_outbox',
        'firestore_ingest_suppressed_ids',
        'sync_user_theme_outbox',
        'entry_engagement',
        'user_themes',
        'entry_themes',
      ]) {
        expect(await tableExists(fx.db, t)).toBe(true);
      }
      const after = (await fx.db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM entries'
      ))!.n;
      expect(after).toBe(before);

      // Sync work in flight survives the migration.
      expect(
        (await fx.db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_queue'))!.n
      ).toBe(1);
      expect(
        (await fx.db.getFirstAsync<{ n: number }>(
          'SELECT COUNT(*) AS n FROM sync_tombstone_outbox'
        ))!.n
      ).toBe(1);
      fx.db.close();
    });

    it('never guesses how v1 material was captured', async () => {
      const fx = buildLegacyFixture({ entries: 100 });
      await migrate(fx.db);

      const rows = await fx.db.getAllAsync<{ capture_method: string; capture_origin: string }>(
        'SELECT DISTINCT capture_method, capture_origin FROM fragments'
      );
      expect(rows).toEqual([{ capture_method: 'imported', capture_origin: 'legacy' }]);
      fx.db.close();
    });

    it('keeps v1 edit counts out of correction history', async () => {
      const fx = buildLegacyFixture({ entries: 500 });
      await migrate(fx.db);

      const edited = await fx.db.getAllAsync<{
        id: string;
        correction_count: number;
        legacy_edit_count: number;
        corrected_at: string | null;
      }>(
        'SELECT id, correction_count, legacy_edit_count, corrected_at FROM fragments WHERE legacy_edit_count > 0'
      );
      expect(edited.length).toBeGreaterThan(0);
      for (const row of edited) {
        expect(row.correction_count).toBe(0);
        expect(row.corrected_at).toBeNull();
      }

      // The invariant the Record depends on: correction_count == COUNT(fragment_revisions).
      const revisions = (await fx.db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM fragment_revisions'
      ))!.n;
      expect(revisions).toBe(0);
      fx.db.close();
    });

    it('carries provenance back to the v1 row', async () => {
      const fx = buildLegacyFixture({ entries: 50 });
      await migrate(fx.db);

      const row = (await fx.db.getFirstAsync<{
        id: string;
        legacy_entry_id: string;
        captured_at: string;
      }>('SELECT id, legacy_entry_id, captured_at FROM fragments WHERE id = ?', fx.urlId))!;
      expect(row.legacy_entry_id).toBe(fx.urlId);

      const entry = (await fx.db.getFirstAsync<{ created_at: string }>(
        'SELECT created_at FROM entries WHERE id = ?',
        fx.urlId
      ))!;
      expect(row.captured_at).toBe(entry.created_at);
      fx.db.close();
    });

    it('does not interpret a bare URL or a long body during the copy', async () => {
      const fx = buildLegacyFixture({ entries: 50 });
      await migrate(fx.db);

      const url = (await fx.db.getFirstAsync<{ body: string; capture_method: string }>(
        'SELECT body, capture_method FROM fragments WHERE id = ?',
        fx.urlId
      ))!;
      // Enrichment is a later, reversible step. The migration copies text and nothing else.
      expect(url.capture_method).toBe('imported');
      expect(url.body).toContain('utm_source=feed');
      expect(
        (await fx.db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM encounters'))!.n
      ).toBe(0);

      const long = (await fx.db.getFirstAsync<{ body: string }>(
        'SELECT body FROM fragments WHERE id = ?',
        fx.longId
      ))!;
      expect(long.body.length).toBeGreaterThan(10_000);
      fx.db.close();
    });

    it('marks the theme archive as owed when there are themes to keep', async () => {
      const fx = buildLegacyFixture({ entries: 20 });
      await migrate(fx.db);
      expect(await getMeta(fx.db, 'themes.archive')).toBe('owed');
      fx.db.close();
    });

    it('does not owe an archive on a fresh install', async () => {
      const db = openTestDb();
      await migrate(db);
      expect(await getMeta(db, 'themes.archive')).toBe('not-needed');
      db.close();
    });

    it('survives being interrupted and resumed', async () => {
      const fx = buildLegacyFixture({ entries: 300 });

      // Stop the ladder inside step 2 by making the transaction throw.
      const realExec = fx.db.execAsync.bind(fx.db);
      let armed = true;
      fx.db.execAsync = async (sql: string) => {
        if (armed && sql.includes('CREATE TABLE IF NOT EXISTS fragments')) {
          armed = false;
          throw new Error('simulated power loss');
        }
        return realExec(sql);
      };
      await expect(migrate(fx.db)).rejects.toThrow('simulated power loss');

      // Step 1 committed; step 2 rolled back whole.
      expect(await userVersion(fx.db)).toBe(1);
      expect(await tableExists(fx.db, 'fragments')).toBe(false);
      expect(await tableExists(fx.db, 'entries')).toBe(true);

      const report = await migrate(fx.db);
      expect(report.from).toBe(1);
      expect(report.ran).toEqual([2, 3, 4, 5]);
      expect(report.fragmentsImported).toBe(fx.materialEntries);
      fx.db.close();
    });
  });

  describe('the schema the ladder leaves behind', () => {
    it('enforces the closed set of capture methods', async () => {
      const db = openTestDb();
      await migrate(db);
      await expect(
        db.runAsync(
          "INSERT INTO fragments (id, body, captured_at, capture_method) VALUES ('x','hi','2026-01-01T00:00:00Z','telepathy')"
        )
      ).rejects.toThrow();
      db.close();
    });

    it('will not let a fragment continue itself', async () => {
      const db = openTestDb();
      await migrate(db);
      await db.runAsync(
        "INSERT INTO fragments (id, body, captured_at) VALUES ('a','hi','2026-01-01T00:00:00Z')"
      );
      await expect(
        db.runAsync(
          "INSERT INTO continuations (fragment_id, continues_id, linked_at, origin) VALUES ('a','a','2026-01-01T00:00:00Z','explicit')"
        )
      ).rejects.toThrow();
      db.close();
    });

    it('keeps a Line a chain, never a graph', async () => {
      const db = openTestDb();
      await migrate(db);
      for (const id of ['a', 'b', 'c']) {
        await db.runAsync(
          'INSERT INTO fragments (id, body, captured_at) VALUES (?, ?, ?)',
          id,
          id,
          '2026-01-01T00:00:00Z'
        );
      }
      await db.runAsync(
        "INSERT INTO continuations (fragment_id, continues_id, linked_at, origin) VALUES ('b','a','2026-01-01T00:00:00Z','explicit')"
      );
      // b already continues something; it cannot continue a second thing.
      await expect(
        db.runAsync(
          "INSERT INTO continuations (fragment_id, continues_id, linked_at, origin) VALUES ('b','c','2026-01-01T00:00:00Z','explicit')"
        )
      ).rejects.toThrow();
      db.close();
    });

    it('cascades derived rows when a fragment is finally destroyed', async () => {
      const db = openTestDb();
      await migrate(db);
      await db.runAsync(
        "INSERT INTO fragments (id, body, captured_at) VALUES ('a','hi','2026-01-01T00:00:00Z')"
      );
      await db.runAsync(
        "INSERT INTO fragment_revisions (fragment_id, body, superseded_at, revision_index) VALUES ('a','was','2026-01-01T00:00:00Z',0)"
      );
      await db.runAsync("DELETE FROM fragments WHERE id = 'a'");
      expect(
        (await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM fragment_revisions'))!.n
      ).toBe(0);
      db.close();
    });
  });
});
