/**
 * Parity against the prototype's own code.
 *
 * `record/__testsupport__/prototype/chinottoData.js` is the vendored, unmodified model layer
 * the mobile and desktop prototypes share. These tests run it and `record/model/*` over the
 * identical corpus and diff the results, so "faithful port" is a measured claim rather than
 * an assertion in a commit message.
 *
 * A failure here means one of two things: the port drifted, or the prototype changed. Both
 * are findings. Neither is fixed by editing the vendored file.
 */

import {
  PROTOTYPE_NOW,
  prototype,
  prototypeCorpus,
  toMaterial,
  type PrototypeBand,
  type PrototypeFragment,
} from '../__testsupport__/prototypeCorpus';
import { bandsFor, lastMonthWithData, yearsSummary, type RecordBand } from '../model/bands';
import { parseAnchor } from '../model/anchors';
import { suggestContinuation } from '../model/continuation';
import { displayText, firstLine, hay } from '../model/material';
import { ago, dayLabel, fmtDur, fmtTime, fullDate, monthLabel } from '../model/time';
import { parts, sharedCount, sharedRun, stem, tokens } from '../model/words';

const NOW = PROTOTYPE_NOW;

/** A band, reduced to what the record actually draws from it. */
function shapeOurs(bands: RecordBand[]) {
  return bands.map((b) =>
    b.type === 'years'
      ? { type: 'years', years: b.years.map((y) => ({ y: y.y, count: y.count, months: y.months })) }
      : { type: 'band', D: b.D, labels: b.labels, ids: b.items.map((i) => i.id) }
  );
}

function shapeTheirs(bands: PrototypeBand[]) {
  return bands.map((b) =>
    b.type === 'years'
      ? { type: 'years', years: b.years.map((y) => ({ y: y.y, count: y.count, months: y.months })) }
      : { type: 'band', D: b.D, labels: b.labels, ids: b.items.map((i) => i.id) }
  );
}

describe('parity with the prototype', () => {
  const frags: PrototypeFragment[] = prototype.buildCorpus();
  const material = prototypeCorpus();

  it('reads the same corpus', () => {
    expect(frags.length).toBeGreaterThan(2000);
    expect(material.length).toBe(frags.length);
  });

  describe('what a moment says it is', () => {
    it('agrees on display text, first line and the Find haystack for every fragment', () => {
      const mismatches: string[] = [];
      for (let i = 0; i < frags.length; i += 1) {
        const f = frags[i];
        const m = material[i];
        if (prototype.displayText(f) !== displayText(m)) {
          mismatches.push(`displayText ${f.id}: ${JSON.stringify(prototype.displayText(f))} vs ${JSON.stringify(displayText(m))}`);
        }
        if (prototype.firstLine(f) !== firstLine(m)) {
          mismatches.push(`firstLine ${f.id}`);
        }
        if (prototype.hay(f) !== hay(m)) {
          mismatches.push(`hay ${f.id}: ${JSON.stringify(prototype.hay(f))} vs ${JSON.stringify(hay(m))}`);
        }
      }
      expect(mismatches.slice(0, 10)).toEqual([]);
    });
  });

  describe('how the record arranges itself', () => {
    it('produces the identical band sequence at the edge', () => {
      const ours = bandsFor({ material, now: NOW });
      const theirs = prototype.bandsFor({ frags, now: NOW });
      expect(shapeOurs(ours)).toEqual(shapeTheirs(theirs));
    });

    it('produces the identical band sequence while standing, in several months', () => {
      for (const anchor of [
        { y: 2024, m: 2 },
        { y: 2021, m: 2 },
        { y: 2026, m: 8 },
        { y: 2020, m: 10 },
      ]) {
        const ours = bandsFor({ material, now: NOW, anchor });
        const theirs = prototype.bandsFor({ frags, now: NOW, anchor });
        expect(shapeOurs(ours)).toEqual(shapeTheirs(theirs));
      }
    });

    it('produces the identical band sequence under Find', () => {
      for (const query of ['folder', 'ferry', 'the', 'zzzz', 'soup']) {
        const ours = bandsFor({ material, now: NOW, query });
        const theirs = prototype.bandsFor({ frags, now: NOW, query });
        expect(shapeOurs(ours)).toEqual(shapeTheirs(theirs));
      }
    });

    it('withholds held material identically', () => {
      const exclude: Record<string, boolean> = {};
      for (const f of frags.slice(0, 5)) exclude[f.id] = true;
      const ours = bandsFor({ material, now: NOW, exclude });
      const theirs = prototype.bandsFor({ frags, now: NOW, exclude });
      expect(shapeOurs(ours)).toEqual(shapeTheirs(theirs));
    });

    const levelsOf = (bands: RecordBand[]) =>
      bands
        .filter((b): b is Extract<RecordBand, { type: 'band' }> => b.type === 'band')
        .map((b) => b.D);

    it('reads strictly chronologically, whatever the banding does', () => {
      // The property that makes this a record and not a feed: material is never reordered
      // into a tier. A band is opened when the level changes; nothing is moved to join one.
      for (const anchor of [null, { y: 2024, m: 2 }, { y: 2021, m: 2 }]) {
        const ats = bandsFor({ material, now: NOW, anchor }).flatMap((b) =>
          b.type === 'band' ? b.items.map((i) => i.at) : []
        );
        expect(ats).toEqual([...ats].sort((a, b) => b - a));
      }
    });

    it('rises and falls around where you stand, reopening tiers it has already used', () => {
      // At the edge, time runs one way, so the levels only ever recede: 0,1,2,3,4.
      expect(levelsOf(bandsFor({ material, now: NOW }))).toEqual([0, 1, 2, 3, 4]);

      // Standing inside the record, distance is measured in both directions, so the same
      // tier genuinely appears twice — the case a fixed block per tier could not express.
      expect(levelsOf(bandsFor({ material, now: NOW, anchor: { y: 2024, m: 2 } }))).toEqual([
        4, 3, 2, 1, 0, 1, 2, 3, 4,
      ]);
      expect(levelsOf(bandsFor({ material, now: NOW, anchor: { y: 2021, m: 2 } }))).toEqual([
        4, 3, 2, 1, 0, 1, 2, 3,
      ]);
    });

    it('summarises years identically', () => {
      expect(yearsSummary(material)).toEqual(prototype.yearsSummary(frags));
      for (const y of [2020, 2021, 2022, 2023, 2024, 2025, 2026, 2019]) {
        expect(lastMonthWithData(material, y)).toBe(prototype.lastMonthWithData(frags, y));
      }
    });
  });

  describe('words', () => {
    const sample = frags.slice(0, 400);

    it('stems and tokenises identically across the corpus', () => {
      for (const f of sample) {
        const text = prototype.displayText(f);
        expect(tokens(text)).toEqual(prototype.tokens(text));
      }
      for (const w of ['folders', 'filing', 'deciding', 'quietly', 'is', 'a', 'us', "don’t", 'names']) {
        expect(stem(w)).toBe(prototype.stem(w));
      }
    });

    it('finds the same shared runs and counts', () => {
      for (let i = 0; i < 120; i += 1) {
        const a = prototype.tokens(prototype.displayText(sample[i]));
        const b = prototype.tokens(prototype.displayText(sample[(i * 7 + 3) % sample.length]));
        expect(sharedRun(a as never, b as never)).toEqual(prototype.sharedRun(a, b));
        expect(sharedCount(a as never, b as never)).toBe(prototype.sharedCount(a, b));
      }
    });

    it('splits text around matched phrases identically', () => {
      const text =
        "putting something in a folder means deciding what it is before I'm done thinking it";
      for (const phrases of [
        ['deciding what it is before'],
        ['folder', 'thinking'],
        [],
        ['nothing here'],
      ]) {
        expect(parts(text, phrases)).toEqual(prototype.parts(text, phrases));
      }
      expect(parts('', ['x'])).toEqual(prototype.parts('', ['x']));
    });
  });

  describe('typed dates', () => {
    it('parses exactly what the prototype parses, including the three-way answer', () => {
      const inputs = [
        'today',
        'now',
        'march 2024',
        'mar 2024',
        'MARCH 2024',
        '  march 2024  ',
        '2019',
        '2026',
        'martian 2024',
        'marc 2024',
        'jan 1999',
        'a sentence',
        'march',
        '2019 was hard',
        'sep 2026',
      ];
      for (const input of inputs) {
        expect(parseAnchor(input)).toEqual(prototype.parseAnchor(input, NOW));
      }
    });
  });

  describe('the continuation offer', () => {
    it('offers the same continuation for material captured now', () => {
      // Drive both with the same freshly captured moment.
      const cases = [
        'the folder thing again, still no better idea',
        'ferry back is 16:40',
        'ok',
        'nothing in this sentence resembles anything at all in the record whatsoever',
      ];
      for (const text of cases) {
        const f: PrototypeFragment = { id: 'new', at: NOW, text, kind: 'text' };
        const theirs = prototype.suggestContinuation(f, frags, NOW);
        const ours = suggestContinuation(toMaterial(f), material, NOW);
        expect(ours?.id ?? null).toBe(theirs?.id ?? null);
        expect(ours?.score ?? null).toBe(theirs?.score ?? null);
        expect(ours?.text ?? null).toBe(theirs?.text ?? null);
        expect(ours?.when ?? null).toBe(theirs?.when ?? null);
      }
    });
  });

  describe('how a moment says when', () => {
    it('labels every fragment in the corpus identically', () => {
      for (const f of frags) {
        expect(dayLabel(f.at, NOW)).toBe(prototype.dayLabel(f.at, NOW));
        expect(monthLabel(f.at, NOW)).toBe(prototype.monthLabel(f.at, NOW));
        expect(monthLabel(f.at, NOW, true)).toBe(prototype.monthLabel(f.at, NOW, true));
        expect(fullDate(f.at)).toBe(prototype.fullDate(f.at));
        expect(ago(f.at, NOW)).toBe(prototype.ago(f.at, NOW));
        expect(fmtTime(f.at)).toBe(prototype.fmtTime(f.at));
      }
    });

    it('formats durations identically', () => {
      for (const s of [0, 1, 6, 42, 59, 60, 61, 118, 599, 600, 3601]) {
        expect(fmtDur(s)).toBe(prototype.fmtDur(s));
      }
    });
  });
});
