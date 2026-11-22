import { connectionBetween, possibleConnection } from '../model/connections';
import { migrate } from '../migrate';
import { createRecordStore } from '../store';
import { openTestDb } from '../__testsupport__/nodeSqliteDb';

it('chooses one dated, checkable pair and withdraws it when the words or source disappear', async () => {
  const db = openTestDb();
  try {
    await migrate(db);
    let seq = 0;
    const store = createRecordStore(db, { newId: () => `thought-${++seq}` });
    const source = await store.capture({ body: 'Conscience, procrastination, sorting: three words together' });
    const recent = await store.capture({ body: 'sorting is procrastination with a clear conscience', at: source.at - 1000 });
    const old = await store.capture({ body: 'sorting is Procrastination with a conscience, beyond resorting', at: source.at - 90000000 });
    expect(possibleConnection(source, [source, recent, old], new Set())).toBe(old.id);
    expect(possibleConnection(source, [recent, old], new Set([old.id]))).toBe(recent.id);
    const pair = connectionBetween(source, old)!;
    expect(pair.sourceExcerpt.map((part) => part.t).join('')).toBe(source.body);
    expect(pair.relatedExcerpt.filter((part) => part.m).map((part) => part.t))
      .toEqual(['sorting', 'Procrastination', 'conscience']);
    expect(connectionBetween(source, { ...old, body: 'sorting thoughts at a cafe' })).toBeNull();
    expect(connectionBetween(source, { ...old, removedAt: source.at })).toBeNull();
    expect(connectionBetween({ ...source, lineId: 'line' }, { ...old, lineId: 'line' })).toBeNull();
  } finally {
    db.close();
  }
});
