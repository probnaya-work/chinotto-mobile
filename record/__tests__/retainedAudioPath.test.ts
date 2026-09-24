/**
 * The only files the Record will delete are its own recordings.
 *
 * Paths come out of the database. A path that climbs out of the audio directory, or names
 * something that is not a recording, is refused rather than normalised.
 */

import { AUDIO_DIR, audioPathFor, deleteRecordFile, isRetainedAudioPath } from '../files';

describe('retained audio paths', () => {
  it('accepts what audioPathFor writes', () => {
    expect(isRetainedAudioPath(audioPathFor('3f2b9c1e-0000-4000-8000-000000000001'))).toBe(true);
    expect(audioPathFor('n1_123')).toBe(`${AUDIO_DIR}/n1_123.m4a`);
  });

  it.each([
    'chinotto/audio/../record.db',
    'chinotto/audio/../../Library/x.m4a',
    'chinotto/audio/sub/x.m4a',
    'chinotto/audio/.hidden.m4a',
    'chinotto/audio/x.caf',
    'chinotto/themes.txt',
    '/chinotto/audio/x.m4a',
    'x.m4a',
    '',
  ])('refuses %p', (path) => {
    expect(isRetainedAudioPath(path)).toBe(false);
    expect(deleteRecordFile(path)).toBe(false);
  });
});
