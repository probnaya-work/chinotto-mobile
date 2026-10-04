/**
 * What Android's back gesture puts away, one layer at a time. See `record/back.ts`.
 */

import { appBackStep, recordBackStep, type RecordBackState } from '../back';

describe('back, over the app', () => {
  const closed = { syncOpen: false, share: false, surface: 'record' as const, settingsPage: null };

  it('falls through to the record with nothing in front', () => {
    expect(appBackStep(closed)).toBeNull();
  });

  it('takes the top-most overlay first', () => {
    expect(
      appBackStep({ syncOpen: true, share: true, surface: 'settings', settingsPage: 'delete' })
    ).toBe('close-sync');
    expect(appBackStep({ ...closed, share: true, surface: 'settings', settingsPage: 'root' })).toBe(
      'close-share'
    );
    expect(appBackStep({ ...closed, surface: 'widget' })).toBe('close-widget');
  });

  it('walks settings back to its root before closing it', () => {
    expect(appBackStep({ ...closed, surface: 'settings', settingsPage: 'manifesto' })).toBe(
      'settings-root'
    );
    expect(appBackStep({ ...closed, surface: 'settings', settingsPage: 'delete' })).toBe(
      'settings-root'
    );
    expect(appBackStep({ ...closed, surface: 'settings', settingsPage: 'root' })).toBe(
      'close-settings'
    );
  });
});

describe('back, inside the record', () => {
  const none: RecordBackState = {
    yearsOpen: false,
    focusOpen: false,
    correcting: false,
    continuing: false,
    anchored: false,
    selected: false,
  };

  it('is not consumed when the record is at the edge', () => {
    expect(recordBackStep(none)).toBeNull();
  });

  it('puts away one layer at a time, top-most first', () => {
    expect(recordBackStep({ ...none, yearsOpen: true, focusOpen: true, anchored: true })).toBe(
      'close-years'
    );
    expect(recordBackStep({ ...none, focusOpen: true, correcting: true, continuing: true })).toBe(
      'cancel-correction'
    );
    expect(recordBackStep({ ...none, focusOpen: true, continuing: true })).toBe('stop-continue');
    expect(recordBackStep({ ...none, focusOpen: true, anchored: true })).toBe('close-focus');
    expect(recordBackStep({ ...none, anchored: true, selected: true })).toBe('clear-anchor');
    expect(recordBackStep({ ...none, selected: true })).toBe('clear-selection');
  });
});
