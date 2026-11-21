import { connectionBetween, meaningConnectionBetween, possibleConnection } from '../model/connections';
import { findConnection } from '../findConnection';
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

it('selects one meaning match, shows exactly what was compared and withdraws changed evidence', async () => {
  const db = openTestDb();
  try {
    await migrate(db);
    let seq = 0;
    const store = createRecordStore(db, { newId: () => `meaning-${++seq}` });
    const source = await store.capture({ body: 'I keep filling every pause with a screen.' });
    const old = await store.capture({
      body: 'Silence feels harder to sit through than another distraction.',
      at: source.at - 800 * 86_400_000,
    });
    const unrelated = await store.capture({ body: 'The oven needs another twenty minutes for the bread.' });
    expect(possibleConnection(source, [unrelated, old], new Set())).toBeNull();
    const score = jest.fn(async () => ({ scores: [0.41, 0.91] }));
    const result = await findConnection(source, [unrelated, old], new Set(), score);
    expect(score).toHaveBeenCalledWith(source.body, [unrelated.body, old.body]);
    expect(result).toEqual({ id: old.id, meaning: {
      sourceExcerpt: source.body, candidate: { id: old.id, excerpt: old.body },
    } });
    if (typeof result !== 'object' || !result.meaning) throw new Error('missing meaning match');
    expect(meaningConnectionBetween(source, old, result.meaning)?.relatedExcerpt)
      .toEqual([{ t: old.body, m: false, n: true }]);
    expect(meaningConnectionBetween(source, { ...old, body: 'rewritten completely' }, result.meaning)).toBeNull();
    expect(meaningConnectionBetween({ ...source, removedAt: source.at }, old, result.meaning)).toBeNull();
    expect(await findConnection(source, [unrelated, old], new Set(), async () => ({ scores: [0.88, 0.90] })))
      .toBe('empty');
    expect(await findConnection(source, [unrelated, old], new Set(), async () => ({ scores: [0.50, 0.74] })))
      .toBe('empty');
    expect(await findConnection(source, [old], new Set([old.id]), score)).toBe('empty');
    expect(score).toHaveBeenCalledTimes(1);
    expect(await findConnection(source, [old], new Set(), async () => ({ preparing: true }))).toBe('preparing');
    expect(await findConnection(source, [old], new Set(), async () => { throw new Error('unavailable'); })).toBe('empty');
  } finally {
    db.close();
  }
});

it('keeps lexical evidence, excludes existing relationships and samples older thoughts within the model budget', async () => {
  const db = openTestDb();
  try {
    await migrate(db);
    let seq = 0;
    const store = createRecordStore(db, { newId: () => String(++seq) });
    const source = await store.capture({ body: 'Conscience, procrastination, sorting: three words together' });
    const literal = await store.capture({ body: 'sorting is procrastination with a clear conscience' });
    const score = jest.fn(async (_source: string, values: string[]) => ({ scores: values.map(() => null) }));
    expect(await findConnection(source, [literal], new Set(), score)).toEqual({ id: literal.id });
    expect(score).not.toHaveBeenCalled();
    const unrelated = Array.from({ length: 96 }, (_, index) => ({
      ...literal, id: `candidate-${index}`, body: `a different original excerpt number ${index}`,
    }));
    const repeated = { ...literal, id: 'observed', body: source.body };
    const heldInLine = { ...literal, id: 'in-line', lineId: 'same-line' };
    await findConnection({ ...source, lineId: 'same-line' }, [repeated, heldInLine, ...unrelated], new Set(), score);
    const [, excerpts] = score.mock.calls[0];
    expect(excerpts).toHaveLength(47);
    expect(excerpts[0]).toBe(unrelated[0].body);
    expect(excerpts.at(-1)).toBe(unrelated.at(-1)?.body);
    expect(excerpts).not.toContain(repeated.body);
    expect(excerpts).not.toContain(heldInLine.body);
  } finally {
    db.close();
  }
});
