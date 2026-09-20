import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate } from '../migrate';
import { createRecordStore } from '../store';
import { readShare, type SharePayloadLike } from '../share';
import { metBeforeLabel } from '../ui/ShareSurface';
import { urlKey } from '../urlKey';
import { monthLabel } from '../model/time';

const ATLANTIC = 'https://www.theatlantic.com/ideas/archive/2026/09/second-brain-apps/';

describe('reading a share', () => {
  it('keeps the URL, the title and the selection apart', () => {
    const payloads: SharePayloadLike[] = [
      { shareType: 'url', value: ATLANTIC, originalName: 'Why Everyone Suddenly Wants a Second Brain' },
      {
        shareType: 'text',
        value:
          '…the tools promise to remember for you, and then quietly demand that you remember how to use them.',
      },
    ];
    expect(readShare(payloads)).toEqual({
      url: ATLANTIC,
      title: 'Why Everyone Suddenly Wants a Second Brain',
      selectedText:
        '…the tools promise to remember for you, and then quietly demand that you remember how to use them.',
      text: null,
    });
  });

  it('refuses Safari’s filename artifacts as a title', () => {
    for (const artifact of ['www.theatlantic.com.html', 'cmux.com.html', 'second-brain.html']) {
      const result = readShare([
        { shareType: 'url', value: ATLANTIC, originalName: artifact },
      ]);
      expect(result!.title).toBeNull();
    }
  });

  it('drops a "title" that only repeats the URL', () => {
    const result = readShare([
      { shareType: 'url', value: ATLANTIC, originalName: 'second-brain-apps' },
    ]);
    expect(result!.title).toBeNull();
    expect(result!.url).toBe(ATLANTIC);
  });

  it('drops a bare host shared alongside its own link', () => {
    const result = readShare([
      { shareType: 'url', value: ATLANTIC },
      { shareType: 'text', value: 'theatlantic.com' },
    ]);
    expect(result!.selectedText).toBeNull();
    expect(result!.title).toBeNull();
  });

  it('splits a markdown link shared as one string', () => {
    const result = readShare([
      { shareType: 'text', value: `[The Rise of the Second Brain](${ATLANTIC})` },
    ]);
    expect(result!.url).toBe(ATLANTIC);
    expect(result!.title).toBe('The Rise of the Second Brain');
  });

  it('treats a short leftover as a title and a long one as a selection', () => {
    const short = readShare([
      { shareType: 'url', value: ATLANTIC },
      { shareType: 'text', value: 'A Brief History' },
    ]);
    expect(short!.title).toBe('A Brief History');
    expect(short!.selectedText).toBeNull();

    const long = readShare([
      { shareType: 'url', value: ATLANTIC },
      {
        shareType: 'text',
        value: 'the tools promise to remember for you, and then quietly demand something',
      },
    ]);
    expect(long!.selectedText).toContain('quietly demand');
  });

  it('carries a bare URL through as a complete fragment', () => {
    expect(readShare([{ shareType: 'url', value: ATLANTIC }])).toEqual({
      url: ATLANTIC,
      title: null,
      selectedText: null,
      text: null,
    });
  });

  it('carries plain text with no link at all', () => {
    expect(readShare([{ shareType: 'text', value: 'a thought from another app' }])).toEqual({
      url: null,
      title: null,
      selectedText: null,
      text: 'a thought from another app',
    });
  });

  it('says nothing arrived when nothing usable did', () => {
    expect(readShare([{ shareType: 'image', value: 'file:///x.png' }])).toBeNull();
    expect(readShare([])).toBeNull();
  });
});

describe('a shared source becoming an encounter', () => {
  it('keeps the URL byte-for-byte and the selection as the source’s words', async () => {
    const db = openTestDb();
    await migrate(db);
    const store = createRecordStore(db, { newId: () => 'shared-1' });

    const intake = readShare([
      { shareType: 'url', value: `${ATLANTIC}?utm_source=share`, originalName: 'Second Brain' },
      {
        shareType: 'text',
        value: 'the tools promise to remember for you, and then quietly demand that you remember',
      },
    ])!;

    const m = await store.capture({
      body: 'this, but the second half is the whole product problem',
      method: 'shared',
      origin: 'share',
      encounter: {
        urlRaw: intake.url!,
        sourceApp: 'share',
        selectedText: intake.selectedText,
      },
    });

    expect(m.url).toBe(`${ATLANTIC}?utm_source=share`);
    expect(m.urlKey).toBe('theatlantic.com/ideas/archive/2026/09/second-brain-apps');
    expect(m.selectedText).toContain('quietly demand');
    expect(m.body).toBe('this, but the second half is the whole product problem');
    // The person's words and the source's words are separately recoverable, which is the
    // entire reason the share is read structurally.
    expect(m.body).not.toContain('quietly demand');
    db.close();
  });

  it('notices the same source met before, offline, across tracking parameters', async () => {
    const db = openTestDb();
    await migrate(db);
    let n = 0;
    const store = createRecordStore(db, { newId: () => `e${++n}` });

    const first = await store.capture({
      body: 'still annoyed',
      method: 'url',
      at: new Date(2024, 2, 22).getTime(),
      encounter: { urlRaw: ATLANTIC },
    });
    const second = await store.capture({
      body: '',
      method: 'shared',
      origin: 'share',
      at: new Date(2026, 8, 19).getTime(),
      encounter: { urlRaw: `http://theatlantic.com/ideas/archive/2026/09/second-brain-apps?fbclid=z#top` },
    });

    const met = await store.encountersOf(second.urlKey!, second.id);
    expect(met.map((m) => m.id)).toEqual([first.id]);

    const label = metBeforeLabel(
      met.map((m) => monthLabel(m.at, second.at, true))
    );
    expect(label).toBe('you met this site before · mar 2024');
    db.close();
  });

  it('says so plainly the first time', () => {
    expect(metBeforeLabel([])).toBe('first time here');
  });

  it('normalises to the same key whatever the share path did to the URL', () => {
    const variants = [
      ATLANTIC,
      'http://theatlantic.com/ideas/archive/2026/09/second-brain-apps',
      'https://www.theatlantic.com/ideas/archive/2026/09/second-brain-apps/?utm_source=x&utm_campaign=y',
      'theatlantic.com/ideas/archive/2026/09/second-brain-apps#section',
    ];
    const keys = new Set(variants.map(urlKey));
    expect(keys.size).toBe(1);
  });

  it('keeps genuinely different pages apart', () => {
    expect(urlKey('https://a.com/post?p=1')).not.toBe(urlKey('https://a.com/post?p=2'));
    expect(urlKey('https://a.com/one')).not.toBe(urlKey('https://a.com/two'));
    // Case in a path is preserved: plenty of sites serve different content for each.
    expect(urlKey('https://a.com/One')).not.toBe(urlKey('https://a.com/one'));
  });
});


describe('the payload the extension actually writes', () => {
  /**
   * Captured from a real share out of Safari on a simulator: the extension received the
   * URL and serialised exactly this into the app group. The module renames `type` to
   * `shareType` on the way to JS, which is the shape below.
   *
   * Written down because every other case here was composed by hand, and a payload shape
   * nobody has seen is a guess about the one thing this module exists to read.
   */
  it('takes a url-only share from safari', () => {
    const intake = readShare([
      {
        shareType: 'url',
        mimeType: 'text/html',
        value: 'https://www.theatlantic.com/ideas/archive/2026/09/second-brain-apps/',
      } as unknown as Parameters<typeof readShare>[0][number],
    ]);
    expect(intake).not.toBeNull();
    expect(intake!.url).toBe(
      'https://www.theatlantic.com/ideas/archive/2026/09/second-brain-apps/'
    );
    expect(intake!.selectedText).toBeNull();
  });

  it('takes the same share once it has been resolved, with title and selection', () => {
    const intake = readShare([
      {
        shareType: 'url',
        mimeType: 'text/html',
        value: 'https://www.theatlantic.com/ideas/archive/2026/09/second-brain-apps/',
        contentType: 'website',
        originalName: 'The Second Brain Is a Filing Cabinet',
      } as unknown as Parameters<typeof readShare>[0][number],
      {
        shareType: 'text',
        mimeType: 'text/plain',
        value: 'the moment I name a thing I stop looking at it',
      } as unknown as Parameters<typeof readShare>[0][number],
    ]);
    expect(intake).not.toBeNull();
    expect(intake!.url).toContain('theatlantic.com');
    // The passage the source supplied is kept apart from the person's own words.
    expect(intake!.selectedText).toBe('the moment I name a thing I stop looking at it');
  });
});
