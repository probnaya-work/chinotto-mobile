import { existsSync, rmSync, statSync } from 'fs';
import { buildLegacyFixture } from '../__testsupport__/legacyFixture';
import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate, TARGET_VERSION } from '../migrate';
import { archiveThemesIfNeeded } from '../themeArchive';
import { createRecordStore } from '../store';

const FILE = '/private/tmp/claude-501/-Users-bogart-Dev-chinotto-mobile/65d89514-c647-4c36-802e-01512008c008/scratchpad/chinotto-upgrade.db';

describe('upgrading a real database file on disk', () => {
  afterAll(() => rmSync(FILE, { force: true }));

  it('carries a four-year v1 phone across, reopening the file as the app would', async () => {
    rmSync(FILE, { force: true });

    // A v1 install, written to disk and closed — the state an upgrade actually finds.
    const fx = buildLegacyFixture({ entries: 3000, file: FILE });
    const expected = fx.materialEntries;
    fx.db.close();
    expect(existsSync(FILE)).toBe(true);
    const sizeBefore = statSync(FILE).size;

    // The app launches on the new build and opens the same file.
    const first = openTestDb(FILE);
    const report = await migrate(first);
    expect(report.from).toBe(0);
    expect(report.to).toBe(TARGET_VERSION);
    expect(report.fragmentsImported).toBe(expected);
    await archiveThemesIfNeeded(first, { writeFile: async (n) => `/documents/${n}` });

    // Someone writes something, then kills the app.
    const store = createRecordStore(first, { newId: () => 'after-upgrade' });
    await store.capture({ body: 'first thing on the new build' });
    first.close();

    // And launches again.
    const second = openTestDb(FILE);
    const again = await migrate(second);
    expect(again.ran).toEqual([]);

    const store2 = createRecordStore(second);
    const all = await store2.loadRecord();
    expect(all.length).toBe(expected + 1);
    expect(all[0].body).toBe('first thing on the new build');

    // The v1 material and its tables are still there, untouched.
    const entries = (await second.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM entries'))!;
    expect(entries.n).toBe(fx.totalEntries);
    const themes = (await second.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM user_themes'))!;
    expect(themes.n).toBe(3);
    const archive = (await second.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM archived_material'))!;
    expect(archive.n).toBe(1);

    expect(statSync(FILE).size).toBeGreaterThan(sizeBefore);
    second.close();
  }, 120_000);
});
