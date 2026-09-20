/**
 * What a moment says about where it came from.
 *
 * One word, in focus, under the date. It is a claim, so every case here is a way of making
 * one the record was never told — and the one that matters most is the oldest material
 * somebody has, which arrived from v1 with a body, a date, and nothing else at all.
 */

import { sourceOf, type Material } from '../model/material';

function moment(over: Partial<Material>): Material {
  return {
    id: 'm',
    at: Date.now(),
    body: 'something',
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

describe('where a moment says it came from', () => {
  it('names the sources this phone actually has', () => {
    expect(sourceOf(moment({}))).toBe('typed');
    expect(sourceOf(moment({ method: 'voice', durationMs: 4000 }))).toBe('voice');
    expect(sourceOf(moment({ origin: 'widget' }))).toBe('widget');
    expect(sourceOf(moment({ method: 'shared' }))).toBe('shared');
    expect(sourceOf(moment({ origin: 'share' }))).toBe('shared');
  });

  it('does not claim a v1 entry was typed, because nothing ever said so', () => {
    // The old model had a body and a date. It had no notion of how anything was captured,
    // so `typed` would make four years of somebody's material — including whatever they
    // spoke — state something it was never told.
    expect(sourceOf(moment({ method: 'imported', origin: 'legacy' }))).toBe('carried over');
    expect(sourceOf(moment({ method: 'imported', origin: null }))).toBe('carried over');
  });

  it('still names the mac, which the wire does say', () => {
    expect(sourceOf(moment({ method: 'imported', origin: 'desktop' }))).toBe('the mac');
  });

  it('does not call something a recording on a phone that has no recording', () => {
    // Audio does not cross the wire — it is the canonical material and stays where it was
    // made. So a spoken moment arriving on a second device genuinely is not a recording
    // there, and says `carried over` rather than `voice`, which would offer a play mark
    // for a file that does not exist.
    expect(sourceOf(moment({ method: 'imported', origin: 'legacy', durationMs: 9000 }))).toBe(
      'carried over'
    );
  });
});
