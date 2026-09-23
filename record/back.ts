/**
 * What Android's back gesture does.
 *
 * There is no navigator, so there is no history for the system to walk back through: every
 * surface is an overlay on the one record. Left alone, back therefore did the only thing it
 * could — it closed the app from inside settings, from the middle of a correction, from a
 * share half-written.
 *
 * Back now puts away whatever is in front, one layer at a time, in the order the overlays are
 * drawn: the sync sheet over the share sheet over the widget preview over settings, then the
 * record's own layers. Only with nothing in front does it fall through to the system, which
 * leaves the app the ordinary way. The record itself is never modified by back — a pending
 * word in the field is kept, and an unfinished correction is let go of rather than saved.
 *
 * iOS has no back gesture of this kind; nothing here runs there.
 */

import type { SettingsPage } from './ui/Settings';

/** The app's own overlays, above the record. */
export type AppBackState = {
  syncOpen: boolean;
  share: boolean;
  surface: 'record' | 'settings' | 'widget';
  settingsPage: SettingsPage | null;
};

export type AppBackStep = 'close-sync' | 'close-share' | 'close-widget' | 'settings-root' | 'close-settings';

export function appBackStep(s: AppBackState): AppBackStep | null {
  if (s.syncOpen) return 'close-sync';
  if (s.share) return 'close-share';
  if (s.surface === 'widget') return 'close-widget';
  if (s.surface === 'settings') {
    return s.settingsPage && s.settingsPage !== 'root' ? 'settings-root' : 'close-settings';
  }
  return null;
}

/** The record's own layers. */
export type RecordBackState = {
  yearsOpen: boolean;
  focusOpen: boolean;
  /** A correction in progress, inside focus. */
  correcting: boolean;
  /** A continuation being written, inside focus. */
  continuing: boolean;
  /** Standing somewhere back in time, rather than at the edge. */
  anchored: boolean;
  /** A D0 moment selected, with its verbs open. */
  selected: boolean;
};

export type RecordBackStep =
  | 'close-years'
  | 'cancel-correction'
  | 'stop-continue'
  | 'close-focus'
  | 'clear-anchor'
  | 'clear-selection';

export function recordBackStep(s: RecordBackState): RecordBackStep | null {
  if (s.yearsOpen) return 'close-years';
  if (s.focusOpen) {
    if (s.correcting) return 'cancel-correction';
    if (s.continuing) return 'stop-continue';
    return 'close-focus';
  }
  if (s.anchored) return 'clear-anchor';
  if (s.selected) return 'clear-selection';
  return null;
}
