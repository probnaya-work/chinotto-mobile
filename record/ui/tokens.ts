/**
 * The Record's design tokens.
 *
 * Every value here is lifted verbatim from the working mobile prototype
 * (`Chinotto Mobile.dc.html`), which is the UI and visual source of truth. Nothing is
 * interpolated, averaged or extrapolated. Where a value is needed that the prototype does not
 * draw, it is marked UNSPECIFIED rather than invented.
 *
 * Two things carry distance, and they are independent:
 *
 *   1. **Ink** fades as material recedes — a seven-step ladder from `#e6e6e3` to `#5f5e5a`.
 *   2. **Width** narrows as material recedes — Archivo's `wdth` axis at 100 / 88 / 80 / 76,
 *      resolved ahead of time into static families (see `type.ts`).
 *
 * Both move in lockstep with the size and line-clamp rules in `tiers.ts`. None of the three
 * is a function of age: the prototype's `STY` table gives five tiers exactly and states no
 * rule for anything between them.
 */

/** The field the record is written on. */
export const SURFACE = '#141416';
/** Outside the app frame, in the prototype's own page. Not drawn by the app itself. */
export const SURFACE_OUTER = '#0e0e10';

export const ink = {
  /** D0 material, active verbs, the caret, the mark, the filled button's ground. */
  ink: '#e6e6e3',
  /** Held material, focus's other moments, the share sheet's secondary copy. */
  near: '#cfcfcc',
  /** Verbs, the voice chip, `unfold`, `yes`/`not this`. */
  verb: '#c9c9c6',
  /** D1 material, voice transcripts, quotations, edge notices. */
  far: '#b4b4b2',
  /** D2 material, guesses. */
  dim: '#aaa9a4',
  /** D3/D4 material, time labels, provenance, band labels, `remove`. */
  meta: '#8f8e89',
  /** Texture: the year-density bars, `corrected · show`, the pull affordance. */
  faint: '#5f5e5a',
  /** The capture field's placeholder, and nothing else. */
  placeholder: '#4a4a50',
} as const;

export const rule = {
  /** Rails, chips, the unfilled plan row, the quote rail, empty month ticks. */
  line: '#3a3a40',
  /** Section rules inside focus, settings and the share sheet. */
  hair: '#2a2a2e',
} as const;

export const wash = {
  /** A matched phrase, in a Return, a trace or Find. */
  match: 'rgba(230,230,227,0.16)',
  /** The same, one step quieter, inside a trace row. */
  matchTrace: 'rgba(230,230,227,0.14)',
  /** A selected D0 row. */
  selected: 'rgba(230,230,227,0.06)',
  /** Text selection. */
  selection: 'rgba(230,230,227,0.25)',
} as const;

/**
 * The record's scroll frame, inset from the screen.
 *
 * `top` clears the status bar and the pull-for-settings strip; `bottom` clears the capture
 * edge. Both are the prototype's, measured on its own 460 × 900 frame.
 */
const STATUS_BAR_HEIGHT = 54;
const PULL_STRIP_HEIGHT = 34;

export const frame = {
  side: 24,
  /**
   * Below the status bar **and** below the grab strip, which is what this was always meant
   * to be — it was 64, four points short of even the status bar's own strip, so the record
   * ran under the pull affordance and the standing bar and collided with both.
   */
  top: STATUS_BAR_HEIGHT + PULL_STRIP_HEIGHT,
  bottom: 112,
  /** The status bar strip the pull gesture lives under. */
  statusBarHeight: STATUS_BAR_HEIGHT,
  /** The pull-for-settings grab strip. */
  pullStripHeight: PULL_STRIP_HEIGHT,
  /** How far you must pull before settings opens. */
  pullThreshold: 92,
  /** The pull affordance is drawn past this. */
  pullReveal: 6,
} as const;

/** The edge: capture, and the notices stacked above it. */
export const edge = {
  paddingTop: 12,
  paddingBottom: 40,
  minHeight: 64,
  /** The idle caret, standing in for the field. */
  caretWidth: 3,
  caretHeight: 30,
  /** Hold-to-speak, at rest and while recording. */
  micSize: 56,
  micRecordingSize: 72,
  sendSize: 48,
  fieldSize: 22,
  fieldMaxHeight: 220,
} as const;

/** The band label above every tier but D0. */
export const bandLabel = {
  size: 10,
  color: ink.meta,
  /** `0.06em` at 10px. RN letter spacing is in points, not em. */
  letterSpacing: 0.6,
  marginBottom: 6,
} as const;

/**
 * Motion, in milliseconds, with the prototype's own easing.
 *
 * `ease` is `cubic-bezier(.16,.84,.3,1)` in the prototype — a long, late-settling curve used
 * for everything that arrives. React Native's `Easing.bezier` takes the same four numbers.
 */
export const motion = {
  bezier: [0.16, 0.84, 0.3, 1] as const,
  /** A surface pushed in from the right. */
  pushIn: 280,
  /** The Return arriving at the edge. */
  rise: 500,
  /** `let go` — it leaves before it is gone. */
  letGo: 450,
  /** A sheet rising from the bottom. */
  sheetIn: 280,
  /** The launch lockup's exit. */
  launchOut: 520,
  /** Reduced motion still holds the lockup, briefly. */
  launchReducedHold: 500,
  /** The undo offer. Not decoration — see `store.ts`. */
  undoWindow: 8000,
  /** How long a just-saved moment stays open to change. */
  editWindow: 12000,
  /** Below this, a recording is dropped without comment. */
  minRecordingMs: 800,
} as const;

/** The speaking bars, at the four durations the prototype gives them. */
export const RECORDING_BAR_SECONDS = [0.9, 1.2, 0.7, 1.05] as const;
