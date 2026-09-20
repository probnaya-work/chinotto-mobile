import { buildLegacyFixture } from '../__testsupport__/legacyFixture';
import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { getMeta, migrate } from '../migrate';
import { archiveThemesIfNeeded, readThemeArchive } from '../themeArchive';

const AT = () => new Date('2026-09-20T09:41:00.000Z');

describe('retiring recall themes', () => {
  it('does nothing on a fresh install', async () => {
    const db = openTestDb();
    await migrate(db);
    const result = await archiveThemesIfNeeded(db, { now: AT });
    expect(result).toEqual({ state: 'not-needed' });
    db.close();
  });

  it('keeps every user-authored theme and classification', async () => {
    const fx = buildLegacyFixture({ entries: 200 });
    await migrate(fx.db);

    const written: Record<string, string> = {};
    const result = await archiveThemesIfNeeded(fx.db, {
      now: AT,
      writeFile: async (name, contents) => {
        written[name] = contents;
        return `/documents/${name}`;
      },
    });

    expect(result).toMatchObject({ state: 'archived', themes: 3, classifications: 120 });
    expect(result).toHaveProperty('filePath', '/documents/chinotto-themes-archive.txt');

    const archive = await readThemeArchive(fx.db);
    expect(archive).not.toBeNull();
    // Labels, keywords and the person's own filing all survive, verbatim.
    expect(archive!.body).toContain('The flat 🏠');
    expect(archive!.body).toContain('boiler, deposit, radiator');
    expect(archive!.body).toContain('you filed it');
    expect(archive!.body).toContain('chinotto guessed');
    expect(archive!.body).toContain('3 themes · 120 classified moments');
    // And the readable copy is the same material.
    expect(written['chinotto-themes-archive.txt']).toBe(archive!.body);
    fx.db.close();
  });

  it('leaves the v1 theme tables exactly as they were', async () => {
    const fx = buildLegacyFixture({ entries: 50 });
    await migrate(fx.db);
    await archiveThemesIfNeeded(fx.db, { now: AT, writeFile: async (n) => `/documents/${n}` });

    expect(
      (await fx.db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM user_themes'))!.n
    ).toBe(3);
    expect(
      (await fx.db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM entry_themes'))!.n
    ).toBe(120);
    fx.db.close();
  });

  it('keeps the material when the filesystem refuses, and retries later', async () => {
    const fx = buildLegacyFixture({ entries: 50 });
    await migrate(fx.db);

    const result = await archiveThemesIfNeeded(fx.db, {
      now: AT,
      writeFile: async () => {
        throw new Error('ENOSPC');
      },
    });

    // The database copy is the guarantee, and it is there.
    expect(result).toMatchObject({ state: 'archived', filePath: null });
    expect((await readThemeArchive(fx.db))!.body).toContain('The flat 🏠');
    expect(await getMeta(fx.db, 'themes.archive')).toBe('owed-file');

    // Next boot: the file lands, and the material is not duplicated.
    const second = await archiveThemesIfNeeded(fx.db, {
      now: AT,
      writeFile: async (n) => `/documents/${n}`,
    });
    expect(second).toHaveProperty('filePath', '/documents/chinotto-themes-archive.txt');
    expect(await getMeta(fx.db, 'themes.archive')).toBe('done');
    expect(
      (await fx.db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM archived_material'))!.n
    ).toBe(1);
    fx.db.close();
  });

  it('is a no-op once done', async () => {
    const fx = buildLegacyFixture({ entries: 20 });
    await migrate(fx.db);
    await archiveThemesIfNeeded(fx.db, { now: AT, writeFile: async (n) => `/documents/${n}` });

    const again = await archiveThemesIfNeeded(fx.db, {
      now: AT,
      writeFile: async () => {
        throw new Error('should not be called');
      },
    });
    expect(again).toEqual({
      state: 'already-archived',
      filePath: '/documents/chinotto-themes-archive.txt',
    });
    fx.db.close();
  });

  it('does not silently drop a classification whose theme is gone', async () => {
    const fx = buildLegacyFixture({ entries: 20 });
    fx.db.raw
      .prepare(
        'INSERT INTO entry_themes (entry_id, theme_id, confidence, source, locked, classified_at) VALUES (?,?,?,?,?,?)'
      )
      .run('legacy-orphan', 'a-theme-deleted-long-ago', 0.9, 'manual', 0, '2024-01-01T00:00:00.000Z');
    await migrate(fx.db);

    await archiveThemesIfNeeded(fx.db, { now: AT });
    const archive = await readThemeArchive(fx.db);
    expect(archive!.body).toContain('filed under a theme that is no longer here (1)');
    expect(archive!.body).toContain('a-theme-deleted-long-ago');
    fx.db.close();
  });
});
