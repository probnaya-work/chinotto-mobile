import { prototypeCorpus, PROTOTYPE_NOW } from '../__testsupport__/prototypeCorpus';
import type { Material } from '../model/material';
import { MS_DAY } from '../model/time';
import { becauseSentence, returnFor } from '../model/returns';

const NOW = PROTOTYPE_NOW;

function material(over: Partial<Material> & { id: string; at: number }): Material {
  return {
    body: '',
    method: 'typed',
    origin: 'mobile',
    correctedAt: null,
    previousBody: null,
    correctionCount: 0,
    removedAt: null,
    lineId: null,
    url: null,
    urlKey: null,
    sourceApp: null,
    selectedText: null,
    domain: null,
    title: null,
    enrichmentState: null,
    durationMs: null,
    audioMissing: false,
    transcriptState: null,
    ...over,
  };
}

const OLD = NOW - 400 * MS_DAY;
const JUST_NOW = NOW - 3600e3;

describe('the Return', () => {
  describe('the rule: a return that cannot say why must not appear', () => {
    it('brings nothing back when nothing recent points at anything old', () => {
      expect(
        returnFor({
          material: [
            material({ id: 'a', at: OLD, body: 'the neighbour plays four bars every evening' }),
            material({ id: 'b', at: JUST_NOW, body: 'pears, the hard kind' }),
          ],
          now: NOW,
        })
      ).toBeNull();
    });

    it('brings nothing back on age alone — "interval" is not a reason', () => {
      // Twenty years old and entirely alone in the record. Under an interval trigger this
      // would surface; it must not, because there would be nothing to say about why.
      const ancient = material({ id: 'a', at: NOW - 7000 * MS_DAY, body: 'a place to put sentences' });
      expect(returnFor({ material: [ancient], now: NOW })).toBeNull();
    });

    it('every Return it does produce carries evidence pointing at real material', () => {
      const r = returnFor({ material: prototypeCorpus(), now: NOW });
      expect(r).not.toBeNull();
      expect(r!.evidence.relatedId).toBe(r!.because.id);
      expect(r!.evidence.detail).toBeTruthy();
      expect(r!.because.at).toBeGreaterThan(r!.material.at);
    });
  });

  describe('repeated language', () => {
    const old = material({
      id: 'old',
      at: OLD,
      body: "a tag is a folder that's embarrassed about it",
    });
    const recent = material({
      id: 'recent',
      at: JUST_NOW,
      body: "tags are a folder that's embarrassed about it, still true, still no better idea",
    });

    it('quotes the shared words from both sides', () => {
      const r = returnFor({ material: [old, recent], now: NOW })!;
      expect(r.reason).toBe('repeated_language');
      expect(r.material.id).toBe('old');
      expect(r.because.id).toBe('recent');
      expect(r.phraseOld).toBe("folder that's embarrassed about it");
      expect(r.phraseNew).toBe("folder that's embarrassed about it");
    });

    it('will not match on a near-miss the record only half repeats', () => {
      // These two are unmistakably the same thought to a reader, and they share no run of
      // three: "deciding what it is before" against "decide what a thing is before". The
      // Return stays silent rather than claiming a reason it cannot quote. This is the cost
      // of the rule, and it is deliberate — the prototype hard-codes this very pair for its
      // demo precisely because the generic matcher does not find it.
      const a = material({
        id: 'a',
        at: OLD,
        body: "putting something in a folder means deciding what it is before I'm done thinking it",
      });
      const b = material({
        id: 'b',
        at: JUST_NOW,
        body: 'they ask me to decide what a thing is before I have finished having it',
      });
      expect(returnFor({ material: [a, b], now: NOW })).toBeNull();
    });

    it('says why, in the prototype sentence shape', () => {
      const r = returnFor({ material: [old, recent], now: NOW })!;
      const s = becauseSentence(r, NOW);
      expect(s.lead).toBe('you wrote “');
      expect(s.quote).toBe(r.phraseNew);
      expect(s.tail).toMatch(/^” at \d\d:\d\d$/);
    });

    it('ignores a coincidental two-word overlap', () => {
      const a = material({ id: 'a', at: OLD, body: 'the meeting could have been a sentence' });
      const b = material({ id: 'b', at: JUST_NOW, body: 'the meeting ran late' });
      expect(returnFor({ material: [a, b], now: NOW })).toBeNull();
    });
  });

  describe('the same source, met again', () => {
    const old = material({
      id: 'old',
      at: OLD,
      body: 'the second-brain crowd have rebuilt the filing cabinet',
      method: 'url',
      url: 'https://www.theatlantic.com/technology/archive/2024/03/second-brain/',
      urlKey: 'theatlantic.com/technology/archive/2024/03/second-brain',
      domain: 'theatlantic.com',
    });
    const recent = material({
      id: 'recent',
      at: JUST_NOW,
      body: '',
      method: 'shared',
      url: 'https://www.theatlantic.com/technology/archive/2024/03/second-brain/?utm_source=x',
      urlKey: 'theatlantic.com/technology/archive/2024/03/second-brain',
      domain: 'theatlantic.com',
    });

    it('comes back because the source was opened again, and says so', () => {
      const r = returnFor({ material: [old, recent], now: NOW })!;
      expect(r.reason).toBe('same_source');
      expect(r.evidence.kind).toBe('url');
      const s = becauseSentence(r, NOW);
      expect(s.lead).toBe('you opened theatlantic.com again');
      expect(s.quote).toBeNull();
      expect(s.tail).toMatch(/^ at \d\d:\d\d$/);
    });

    it('does not match a different page on the same site', () => {
      const other = { ...recent, urlKey: 'theatlantic.com/ideas/archive/2026/09/something-else' };
      expect(returnFor({ material: [old, other], now: NOW })).toBeNull();
    });
  });

  describe('a line continued', () => {
    it('comes back because the line was added to, and says when', () => {
      const old = material({ id: 'old', at: OLD, body: 'filing feels like work and is not', lineId: 'L1' });
      const recent = material({ id: 'recent', at: JUST_NOW, body: 'still true', lineId: 'L1' });
      const r = returnFor({ material: [old, recent], now: NOW })!;
      expect(r.reason).toBe('line_continued');
      const s = becauseSentence(r, NOW);
      expect(s.lead).toBe('you added to this line');
      expect(s.tail).toMatch(/^ in \w{3}$/);
    });
  });

  describe('what it will not bring back', () => {
    const old = material({
      id: 'old',
      at: OLD,
      body: "a tag is a folder that's embarrassed about it",
    });
    const recent = material({
      id: 'recent',
      at: JUST_NOW,
      body: "tags are a folder that's embarrassed about it, still true",
    });

    it('something removed', () => {
      expect(
        returnFor({ material: [{ ...old, removedAt: NOW - 1000 }, recent], now: NOW })
      ).toBeNull();
    });

    it('something it brought back recently', () => {
      expect(
        returnFor({ material: [old, recent], now: NOW, recentlyReturned: new Set(['old']) })
      ).toBeNull();
    });

    it('something already being kept present', () => {
      expect(returnFor({ material: [old, recent], now: NOW, held: { old: true } })).toBeNull();
    });

    it('something too young to be a return at all', () => {
      const young = { ...old, at: NOW - 30 * MS_DAY };
      expect(returnFor({ material: [young, recent], now: NOW })).toBeNull();
    });

    it('an encounter nobody has said anything about', () => {
      const bare = material({
        id: 'bare',
        at: OLD,
        method: 'url',
        url: 'https://example.com/a',
        urlKey: 'example.com/a',
        domain: 'example.com',
      });
      expect(returnFor({ material: [bare, recent], now: NOW })).toBeNull();
    });
  });

  it('prefers repeated language over the other triggers', () => {
    const language = material({
      id: 'language',
      at: OLD,
      body: 'filing feels like work and is not',
    });
    const line = material({ id: 'line', at: OLD - MS_DAY, body: 'older line moment', lineId: 'L1' });
    const recent = material({
      id: 'recent',
      at: JUST_NOW,
      body: 'filing feels like work and it is not, still',
      lineId: 'L1',
    });
    expect(returnFor({ material: [line, language, recent], now: NOW })!.reason).toBe(
      'repeated_language'
    );
  });

  it('offers exactly one Return, never a queue', () => {
    const r = returnFor({ material: prototypeCorpus(), now: NOW });
    expect(Array.isArray(r)).toBe(false);
    expect(r).toHaveProperty('material');
  });
});
