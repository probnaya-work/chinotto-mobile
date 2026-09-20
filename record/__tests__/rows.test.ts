import { PROTOTYPE_NOW, prototypeCorpus } from '../__testsupport__/prototypeCorpus';
import { bandsFor } from '../model/bands';
import { flattenRecord, type Row } from '../ui/rows';
import { TIERS } from '../ui/tiers';

const NOW = PROTOTYPE_NOW;

const base = {
  showReturn: false,
  held: [],
  isEmptyRecord: false,
  findFoundNothing: false,
  beginsLabel: null,
};

describe('flattening the record for an inverted list', () => {
  const material = prototypeCorpus();
  const bands = bandsFor({ material, now: NOW });

  it('keeps every moment, and only the moments', () => {
    const rows = flattenRecord({ ...base, bands });
    const moments = rows.filter((r) => r.kind === 'moment');
    const banded = bands.flatMap((b) => (b.type === 'band' ? b.items : []));
    expect(moments.map((r) => (r as Extract<Row, { kind: 'moment' }>).material.id)).toEqual(
      banded.map((m) => m.id)
    );
  });

  it('puts the Return at the very bottom, at the edge', () => {
    const rows = flattenRecord({ ...base, bands, showReturn: true });
    expect(rows[0].kind).toBe('return');
  });

  it('puts held material above the Return and below the record', () => {
    const held = material.slice(0, 2);
    const rows = flattenRecord({ ...base, bands, showReturn: true, held });
    expect(rows.slice(0, 4).map((r) => r.kind)).toEqual(['return', 'held', 'held', 'moment']);
  });

  it('labels a band above its material, not below', () => {
    const rows = flattenRecord({ ...base, bands });
    // Index 0 is the bottom of the screen, so a label must come AFTER its own moments.
    const firstLabel = rows.findIndex((r) => r.kind === 'bandLabel');
    expect(firstLabel).toBeGreaterThan(0);
    expect(rows[firstLabel - 1].kind).toBe('moment');
  });

  it('reads chronologically down the screen once the inversion is undone', () => {
    const rows = flattenRecord({ ...base, bands });
    // Top-to-bottom is the reverse of the array.
    const ats = [...rows]
      .reverse()
      .filter((r): r is Extract<Row, { kind: 'moment' }> => r.kind === 'moment')
      .map((r) => r.material.at);
    expect(ats).toEqual([...ats].sort((a, b) => a - b));
  });

  it('gives the years band one row, however many years it holds', () => {
    const rows = flattenRecord({ ...base, bands });
    const years = rows.filter((r) => r.kind === 'years');
    expect(years).toHaveLength(1);
    expect((years[0] as Extract<Row, { kind: 'years' }>).years.length).toBeGreaterThan(3);
  });

  it('spaces moments by their tier, and the last one by the band margin', () => {
    const rows = flattenRecord({ ...base, bands });
    const d0 = rows.filter(
      (r): r is Extract<Row, { kind: 'moment' }> => r.kind === 'moment' && r.tier === 0
    );
    expect(d0.slice(0, -1).every((r) => r.gap === TIERS[0].gap)).toBe(true);
    expect(d0[d0.length - 1].gap).toBe(TIERS[0].marginBottom);
  });

  it('offers the years overlay from D2 and below only', () => {
    const rows = flattenRecord({ ...base, bands });
    for (const r of rows) {
      if (r.kind !== 'bandLabel') continue;
      expect(r.opensYears).toBe(r.tier >= 2);
      expect(r.label.endsWith('↑')).toBe(r.tier >= 2);
    }
  });

  it('never labels D0 at the edge', () => {
    const rows = flattenRecord({ ...base, bands });
    expect(rows.some((r) => r.kind === 'bandLabel' && r.tier === 0)).toBe(false);
  });

  it('puts "the record begins here" at the very top', () => {
    const rows = flattenRecord({ ...base, bands, beginsLabel: 'nov 2020' });
    expect(rows[rows.length - 1]).toEqual({ kind: 'begins', key: 'begins', label: 'nov 2020' });
  });

  it('says the record is empty only when it is', () => {
    expect(flattenRecord({ ...base, bands: [], isEmptyRecord: true })).toEqual([
      { kind: 'empty', key: 'empty' },
    ]);
    expect(flattenRecord({ ...base, bands }).some((r) => r.kind === 'empty')).toBe(false);
  });

  it('gives every row a key that is stable and unique', () => {
    const rows = flattenRecord({
      ...base,
      bands,
      showReturn: true,
      held: material.slice(0, 2),
      beginsLabel: 'nov 2020',
    });
    const keys = rows.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('stays linear on a heavy record', () => {
    const started = Date.now();
    const rows = flattenRecord({ ...base, bands });
    expect(rows.length).toBeGreaterThan(200);
    expect(Date.now() - started).toBeLessThan(200);
  });
});

describe('standing', () => {
  const material = prototypeCorpus();

  it('names where you are standing and how much is there', () => {
    const anchor = { y: 2024, m: 2 };
    const bands = bandsFor({ material, now: NOW, anchor });
    const rows = flattenRecord({ ...base, bands, anchor, now: NOW });

    // Standing, D0 *is* labelled — it is a month, and a month needs naming.
    const d0Label = rows.find(
      (r): r is Extract<Row, { kind: 'bandLabel' }> => r.kind === 'bandLabel' && r.tier === 0
    );
    expect(d0Label).toBeDefined();
    expect(d0Label!.label).toMatch(/^mar 2024 · \d+$/);
    expect(d0Label!.opensYears).toBe(false);
  });

  it('still says nothing above D0 at the edge', () => {
    const bands = bandsFor({ material, now: NOW });
    const rows = flattenRecord({ ...base, bands, anchor: null, now: NOW });
    expect(rows.some((r) => r.kind === 'bandLabel' && r.tier === 0)).toBe(false);
  });
});
