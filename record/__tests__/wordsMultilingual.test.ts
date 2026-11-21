import { toMaterial } from '../__testsupport__/prototypeCorpus';
import { suggestContinuation } from '../model/continuation';
import { guessFor } from '../model/find';
import { MS_DAY } from '../model/time';
import { traces } from '../model/traces';
import { parts, sharedCount, sharedRun, tokens } from '../model/words';

const NOW = Date.UTC(2026, 10, 15, 12);
const moment = (id: string, text: string, at = NOW) =>
  toMaterial({ id, text, at, kind: 'text' });

describe('word evidence in multiple languages', () => {
  it('preserves Cyrillic, accents, numbers and mixed-language text', () => {
    expect(tokens('Мысль sobre café №42').map((t) => t.w)).toEqual([
      'мысль', 'sobre', 'café', '42',
    ]);
    expect(tokens('cafe\u0301')).toEqual(tokens('café'));
    expect(tokens('ещё')).toEqual([{ w: 'ещё', s: 'ещё' }]);
    expect(tokens('🙂 —')).toEqual([]);
  });

  it('offers a Russian continuation and traces using the actual shared phrase', () => {
    const old = moment('old', 'Хочу сохранить спокойное внимание надолго', NOW - MS_DAY);
    const fresh = moment('new', 'Пытаюсь сохранить спокойное внимание сегодня');
    expect(suggestContinuation(fresh, [old, fresh], NOW)?.id).toBe('old');
    expect(traces({ line: [fresh], material: [old, fresh] })[0]).toMatchObject({
      kind: 'seen', phrase: 'сохранить спокойное внимание', material: { id: 'old' },
    });
  });

  it('ranks only supported Russian and Portuguese search suggestions', () => {
    const ru = moment('ru', 'Сохранить спокойное внимание помогает прогулка');
    const pt = moment('pt', 'A atenção melhora depois de tomar café');
    const unrelated = moment('other', 'Nothing here concerns the query at all');
    expect(guessFor('внимание сохранить', [unrelated, ru, pt], NOW).map((g) => g.material.id))
      .toEqual(['ru']);
    expect(guessFor('café atenção', [unrelated, ru, pt], NOW).map((g) => g.material.id))
      .toEqual(['pt']);
  });

  it('does not mistake Russian or Portuguese function words for evidence', () => {
    for (const [a, b] of [
      ['это было вчера', 'это было давно'],
      ['para com uma árvore', 'uma com para janela'],
    ]) {
      expect(sharedRun(tokens(a), tokens(b))).toBeNull();
      expect(sharedCount(tokens(a), tokens(b))).toBe(0);
    }
  });

  it('highlights punctuation-separated words without jumping over Cyrillic letters', () => {
    expect(parts('спокойное, внимание', ['спокойное внимание']).filter((p) => p.m))
      .toEqual([{ t: 'спокойное, внимание', m: true, n: false }]);
    expect(parts('спокойное чужое внимание', ['спокойное внимание']).some((p) => p.m))
      .toBe(false);
  });
});
