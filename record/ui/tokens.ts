/**
 * The Record's design tokens.
 *
 * Every value here is lifted verbatim from the working mobile prototype
 * (`Chinotto Mobile.dc.html`) and the handoff's own "Colour and affordance" table, which
 * together are the UI and visual source of truth. Nothing is interpolated, averaged or
 * extrapolated. Where a value is needed that the design does not draw, it is marked
 * UNSPECIFIED rather than invented.
 *
 * ---------------------------------------------------------------------------------------
 * THE COLOUR SYSTEM
 *
 * Chinotto is monochrome. Your material and your actions are both ink, separated by
 * LIGHTNESS AND WEIGHT. Exactly one hue exists in the product, and it never appears on
 * anything you can press.
 *
 * Four families, and they do not borrow from each other:
 *
 *   1. MATERIAL (`ink`) — your words, and Chinotto's voice. Lightness only: no hue, no
 *      weight. 12.27:1 at the top.
 *   2. AGENCY (`agency`) — every verb, every filled primary, the single recovery in any
 *      error. Lightness AND weight together (`agency.weight`, 540). Neither alone is enough
 *      at 12–14px, which is where most verbs are drawn.
 *   3. EVIDENCE (`evidence`) — what Chinotto found: a matched phrase, a shared phrase, an
 *      observed trace. A ground plus an ink that lifts ABOVE material, so highlighting
 *      raises readability rather than merely tinting it.
 *   4. LIVE (`LIVE`) — the only hue in the product. Voice capture, the connecting pulse, the
 *      sync dot, this device. Never on a verb. It does not mean "ok".
 *
 * Destruction is never loud: `remove`, `stop syncing on this phone` and `delete for good`
 * all sit at `agency.quiet`, and their safe counterpart (`keep it`) takes full agency.
 * System trouble stays neutral and only its recovery lifts.
 *
 * The phone has no hover: where desktop lifts a verb under the pointer, the phone marks a
 * chosen row with `wash.selected` instead. There is no pressed colour, because the design
 * draws none — see `docs/unspecified-decisions.md`.
 *
 * ---------------------------------------------------------------------------------------
 * Two things carry distance, and they are independent:
 *
 *   1. **Ink** fades as material recedes — `#d4d3ce` at D0 down to `#8f8e89` at D3/D4.
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

/**
 * Material: your words, and Chinotto's voice. A verb never takes a value from here.
 */
export const ink = {
  /** D0 material, the caret, the mark. 12.27:1. */
  ink: '#d4d3ce',
  /** Utility body copy, the widget's own label. 9.99:1. */
  near: '#c0bfba',
  /**
   * Material quoted back inside one of Chinotto's own sentences: the continuation offer's
   * `continues “…”?` and the undo notice's `removed “…”`. Your words held at arm's length by
   * the system — not a verb, and it never becomes one. 11.09:1.
   */
  quoted: '#c9c9c6',
  /** D1 material, voice transcripts, quotations, edge notices. 8.86:1. */
  far: '#b4b4b2',
  /** D2 material, guesses. 7.82:1. */
  dim: '#aaa9a4',
  /** D3/D4 material, time labels, provenance, band labels. 5.61:1. */
  meta: '#8f8e89',
  /** Texture: the year-density bars, `corrected · show`, the pull affordance. */
  faint: '#5f5e5a',
  /** The capture field's placeholder, and nothing else. */
  placeholder: '#4a4a50',
} as const;

/**
 * Agency: lightness and weight together.
 *
 * `weight` is not decoration. Anything that colours a verb must also set it, or the verb is
 * only half marked.
 */
export const agency = {
  /** Every verb at rest, and a filled primary's ground. 17.49:1. */
  ink: '#fbf9f4',
  /**
   * A step back, a dismissal, key notation, the correction window, and every destructive
   * verb in the product. 14.87:1.
   */
  quiet: '#e9e7e0',
  /** Text on a filled primary: the field itself, so the button reads as a hole in the page. */
  ground: SURFACE,
  weight: 540,
} as const;

/**
 * Evidence: what Chinotto found.
 *
 * `ink` lifts above material rather than sitting level with it, which is what makes a
 * highlight raise readability instead of merely tinting the words.
 */
export const evidence = {
  /** A matched phrase, in a Return or in Find. */
  ground: 'rgba(230,230,227,0.15)',
  /** The same, one step quieter, inside a trace row. */
  groundTrace: 'rgba(230,230,227,0.13)',
  /** On either ground. 11.12:1. */
  ink: '#f4f2ee',
  /** 2px, on material Chinotto actually observed. */
  rail: '#5c5a52',
  /** An inferred trace takes the dimmer rail and NO ground: a guess is not evidence. */
  railInferred: '#2a2a2e',
} as const;

/**
 * The only hue in Chinotto. 8.54:1.
 *
 * Voice capture, the connecting pulse, the sync dot, this device. Never on a verb, and it
 * never means "ok" — an offline record keeps the sage dot and needs nothing from you.
 */
export const LIVE = '#9fb79f';

export const rule = {
  /** Rails, the unfilled plan row, the quote rail, empty month ticks. */
  line: '#3a3a40',
  /** Section rules inside focus, settings and the share sheet. */
  hair: '#2a2a2e',
  /** A voice chip you can play. */
  chip: '#4e4d48',
  /** The compact tiers' chip, which is drawn but does not play. */
  chipInert: '#3f3e3a',
} as const;

export const wash = {
  /** A matched phrase, in a Return, a trace or Find. */
  match: evidence.ground,
  /** The same, one step quieter, inside a trace row. */
  matchTrace: evidence.groundTrace,
  /** A selected D0 row. The phone's answer to desktop's hover. */
  selected: 'rgba(230,230,227,0.06)',
  /** Text selection. */
  selection: 'rgba(230,230,227,0.26)',
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
