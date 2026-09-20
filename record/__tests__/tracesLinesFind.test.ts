import {
  PROTOTYPE_NOW,
  prototype,
  prototypeCorpus,
  urlKey,
} from '../__testsupport__/prototypeCorpus';
import type { Material } from '../model/material';
import { MS_DAY } from '../model/time';
import { traces, tracesHeading } from '../model/traces';
import { foldLine, lineHeading, lineMeta, lineOf } from '../model/lines';
import { findInWords, findSummary, guessFor, readField } from '../model/find';

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

describe('traces', () => {
  const corpus = prototypeCorpus();
  const line = corpus.filter((m) => m.lineId === 'L1').sort((a, b) => a.at - b.at);

  it('agrees with the prototype on what is seen and what is guessed', () => {
    // The prototype has no same-source notion, so it is compared on the language half only.
    const ours = traces({ line, material: corpus }).filter((t) => t.kind !== 'same_source');
    const theirs = prototype.traces(
      prototype.buildCorpus().filter((f) => f.lineId === 'L1').sort((a, b) => a.at - b.at),
      prototype.buildCorpus(),
      {}
    );

    const shape = (k: string, id: string, phrase: string | null) => `${k}:${id}:${phrase ?? ''}`;
    expect(ours.map((t) => shape(t.kind, t.material.id, t.phrase))).toEqual(
      theirs.map((t) => shape(t.kind, t.frag.id, t.phrase))
    );
  });

  it('never dresses a guess up as a fact', () => {
    for (const t of traces({ line, material: corpus })) {
      if (t.kind === 'guess') {
        // A guess has no phrase to show, and must say why it is guessing.
        expect(t.phrase).toBeNull();
        expect(t.why).toMatch(/shared words, no shared phrase/);
      } else {
        // Anything presented as observed must be able to point at what was observed.
        expect(t.phrase ?? t.why).toBeTruthy();
      }
    }
  });

  it('counts seen and guessed honestly in the heading', () => {
    const list = traces({ line, material: corpus });
    const heading = tracesHeading(list);
    const seen = list.filter((t) => t.kind !== 'guess').length;
    const guessed = list.filter((t) => t.kind === 'guess').length;
    expect(heading).toBe(`traces · ${seen} seen, ${guessed} guessed`);
    expect(seen + guessed).toBe(list.length);
  });

  it('ranks having met the same source above merely sharing words', () => {
    const focus = material({
      id: 'focus',
      at: NOW - 400 * MS_DAY,
      body: 'the second-brain crowd have rebuilt the filing cabinet',
      method: 'url',
      url: 'https://www.theatlantic.com/technology/archive/2024/03/second-brain/',
      urlKey: urlKey('https://www.theatlantic.com/technology/archive/2024/03/second-brain/'),
      domain: 'theatlantic.com',
    });
    const sameSource = material({
      id: 'same',
      at: NOW - 30 * MS_DAY,
      body: 'the article again, still annoyed',
      method: 'url',
      url: 'https://theatlantic.com/technology/archive/2024/03/second-brain/?utm_campaign=x',
      urlKey: urlKey('https://theatlantic.com/technology/archive/2024/03/second-brain/?utm_campaign=x'),
      domain: 'theatlantic.com',
    });
    const guess = material({
      id: 'guess',
      at: NOW - 10 * MS_DAY,
      body: 'rebuilt the cabinet crowd filing something else entirely',
    });

    const list = traces({ line: [focus], material: [sameSource, guess] });
    expect(list[0].material.id).toBe('same');
    expect(list[0].kind).toBe('same_source');
    expect(list[0].why).toContain('theatlantic.com');
  });

  it('honours a "not this" for good — it is a judgement, not a cache', () => {
    const list = traces({ line, material: corpus });
    expect(list.length).toBeGreaterThan(0);
    const rejectedId = list[0].material.id;
    const after = traces({
      line,
      material: corpus,
      judgements: { [rejectedId]: 'rejected' },
    });
    expect(after.map((t) => t.material.id)).not.toContain(rejectedId);
  });

  it('never shows the line back to itself', () => {
    const ids = new Set(line.map((m) => m.id));
    for (const t of traces({ line, material: corpus })) {
      expect(ids.has(t.material.id)).toBe(false);
    }
  });

  it('ignores removed material', () => {
    const removed = corpus.map((m) => ({ ...m, removedAt: NOW }));
    expect(traces({ line, material: removed })).toEqual([]);
  });
});

describe('a Line', () => {
  const corpus = prototypeCorpus();
  const anyOfLine = corpus.find((m) => m.lineId === 'L1')!;

  it('assembles oldest first, however you entered it', () => {
    const line = lineOf(anyOfLine, corpus);
    expect(line.length).toBeGreaterThan(5);
    expect(line.map((m) => m.at)).toEqual([...line.map((m) => m.at)].sort((a, b) => a - b));
  });

  it('is just the moment itself when nothing continues it', () => {
    const lone = corpus.find((m) => m.lineId === null)!;
    expect(lineOf(lone, corpus)).toEqual([lone]);
  });

  it('heads a fragment with its date and a line with its span', () => {
    const lone = corpus.find((m) => m.lineId === null)!;
    expect(lineHeading([lone], lone, NOW)).toMatch(/^a fragment · \d{1,2} \w{3} \d{4}$/);

    const line = lineOf(anyOfLine, corpus);
    expect(lineHeading(line, anyOfLine, NOW)).toMatch(
      /^a line · \d+ moments · \d{4} → (today|\d{4})$/
    );
  });

  it('states a line on a row as a count and a start', () => {
    const line = lineOf(anyOfLine, corpus);
    expect(lineMeta(line, NOW)).toBe(`↳ a line · ${line.length} moments · since mar 2021`);
    expect(lineMeta([anyOfLine], NOW)).toBeNull();
  });

  it('folds the middle at 2 and 2, and says what it hid', () => {
    const line = lineOf(anyOfLine, corpus);
    const folded = foldLine(line, NOW, false);
    expect(folded.filter((e) => e.kind === 'fold')).toHaveLength(1);
    expect(folded.filter((e) => e.kind === 'moment')).toHaveLength(4);

    const fold = folded.find((e) => e.kind === 'fold')!;
    expect(fold.count).toBe(line.length - 4);
    expect(fold.label).toMatch(/^\d+ folded · \w{3} \d{4} – \w{3} \d{4}$/);

    // Head and tail are the real ends of the line.
    expect((folded[0] as { material: Material }).material.id).toBe(line[0].id);
    expect((folded[folded.length - 1] as { material: Material }).material.id).toBe(
      line[line.length - 1].id
    );
  });

  it('unfolds to everything', () => {
    const line = lineOf(anyOfLine, corpus);
    expect(foldLine(line, NOW, true)).toHaveLength(line.length);
  });

  it('does not fold a short line', () => {
    const short = corpus.slice(0, 4).map((m) => ({ ...m, lineId: 'S' }));
    expect(foldLine(short, NOW, false)).toHaveLength(4);
  });
});

describe('Find', () => {
  const corpus = prototypeCorpus();

  it('is a mode of the capture field, entered with a slash', () => {
    expect(readField('folder')).toEqual({ mode: 'capture' });
    expect(readField('/')).toEqual({ mode: 'find', query: '', active: false });
    expect(readField('/folder')).toEqual({ mode: 'find', query: 'folder', active: true });
    expect(readField('/  Folder  ')).toEqual({ mode: 'find', query: 'folder', active: true });
  });

  it('finds in words across body, title, domain and a quotation', () => {
    expect(findInWords(corpus, 'folder').length).toBeGreaterThan(5);
    expect(findInWords(corpus, 'theatlantic.com').length).toBeGreaterThan(0);
    expect(findInWords(corpus, 'quietly demand').length).toBeGreaterThan(0);
    expect(findInWords(corpus, 'zzzznotathing')).toEqual([]);
    expect(findInWords(corpus, '   ')).toEqual([]);
  });

  it('does not find removed material', () => {
    const removed = corpus.map((m) => ({ ...m, removedAt: NOW }));
    expect(findInWords(removed, 'folder')).toEqual([]);
  });

  it('offers at most three guesses when the words find nothing', () => {
    const guesses = guessFor('cabinet filing garden', corpus, NOW);
    expect(guesses.length).toBeLessThanOrEqual(3);
    expect(guesses.every((g) => g.when.length > 0)).toBe(true);
  });

  it('forgets nothing but honours "not this" within the session', () => {
    const first = guessFor('folder tags embarrassed', corpus, NOW);
    expect(first.length).toBeGreaterThan(0);
    const after = guessFor('folder tags embarrassed', corpus, NOW, {
      [first[0].material.id]: true,
    });
    expect(after.map((g) => g.material.id)).not.toContain(first[0].material.id);
  });

  it('names which reading it is doing', () => {
    expect(findSummary(12, false)).toBe('12 · in words');
    expect(findSummary(12, true)).toBe('12 · by meaning');
  });
});
