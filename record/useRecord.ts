/**
 * The Record's state, as one hook.
 *
 * Everything the surface needs and nothing it does not: the material, what is selected, what
 * is being corrected, where you are standing, what came back and why. Writes go through the
 * store, which enforces the durable rules; this only decides what is on screen.
 *
 * Two pieces of timing live here because they are product behaviour rather than decoration:
 *
 *   * the **twelve seconds** a moment stays open to change after it lands, and the one
 *     continuation offer that may be made inside it;
 *   * the **eight seconds** a removal can be brought back, after which the bridge publishes
 *     it and it is out of this phone's hands.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFindInput } from './useFindInput';
import { RecordLocked } from './privacy';

import { bandsFor, lastMonthWithData, yearsSummary, type Anchor } from './model/bands';
import { parseAnchor, resolveAnchor } from './model/anchors';
import { suggestContinuation, type ContinuationOffer } from './model/continuation';
import { findSummary, readField, guessFor, type Guess } from './model/find';
import { lineOf } from './model/lines';
import { firstLine, type Material } from './model/material';
import { returnFor, resumeReturn, RETURN_COOLDOWN_MS, SAME_FRAGMENT_COOLDOWN_MS, type RecordReturn } from './model/returns';
import { traces, type Trace } from './model/traces';
import { monthLabel } from './model/time';
import { flattenRecord, type Row } from './ui/rows';
import { motion } from './ui/tokens';
import { thoughtLanded } from './feedback';
import { NO_PLAYBACK, type AudioPlaybackPort } from './playback';
import type { RecordBridge } from './bridge';
import { HoldLimitReached, MAX_HELD, type RecordStore } from './store';

/** How long after launch the Return is allowed to arrive. Capture comes first. */
const RETURN_DELAY_MS = 1600;

export type PendingRemoval = { material: Material; at: number };

export type RecordState = ReturnType<typeof useRecord>;

type FocusTarget = { id: string; returned?: Pick<RecordReturn, 'reason' | 'evidence'>; fromConnection?: boolean };

export function useRecord(
  store: RecordStore,
  bridge: RecordBridge,
  nowFn = Date.now,
  audio: AudioPlaybackPort = NO_PLAYBACK,
  readEnabled = true,
  returnCovered = false
) {
  const [material, setMaterial] = useState<Material[]>([]);
  const [heldIds, setHeldIds] = useState<Set<string>>(new Set());
  const [judgements, setJudgements] = useState<Record<string, 'confirmed' | 'rejected'>>({});
  const [ready, setReady] = useState(false);

  const { input, inputNow, setInput, startFind, leaveFind, finding, captureInput, setCaptureInput } = useFindInput();
  const [inputFocused, setInputFocused] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  /**
   * Standing takes the field off the surface — `▲ back to the edge` stands where it was —
   * and an unmounted field never says it lost focus. The flag the caret is drawn from has
   * to follow whether the field is there at all, not the events it can no longer send, or
   * the edge comes back from standing with no caret on it. Every way of standing goes
   * through `anchor`, so this is the one place that can be sure.
   */
  useEffect(() => {
    if (anchor) setInputFocused(false);
  }, [anchor]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const focusId = focusTarget?.id ?? null;
  const setFocusId = useCallback((id: string | null) => {
    setFocusTarget(id === null ? null : { id });
  }, []);
  const [unfolded, setUnfolded] = useState(false);
  const [yearsOpen, setYearsOpen] = useState(false);
  const openExisting = useCallback((moment: Material) => {
    // A scheduled moment can be older than the normal Record window.
    setMaterial((rows) => rows.some(({ id }) => id === moment.id)
      ? rows.map((row) => row.id === moment.id ? moment : row)
      : [...rows, moment].sort((a, b) => b.at - a.at));
    setSelectedId(null);
    setYearsOpen(false);
    setFocusId(moment.id);
  }, [setFocusId]);


  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTextState, setEditTextState] = useState('');
  /** The same rule as the capture field: a correction saved on Return is not a render behind. */
  const editNow = useRef('');
  const editText = editTextState;
  const setEditText = useCallback((text: string) => {
    editNow.current = text;
    setEditTextState(text);
  }, []);
  const [shownPrevious, setShownPrevious] = useState<Record<string, boolean>>({});

  const [continuing, setContinuing] = useState(false);
  const [continueTextState, setContinueTextState] = useState('');
  /** And the same for a Continue, which is a new moment and must not arrive short. */
  const continueNow = useRef('');
  const continueText = continueTextState;
  const setContinueText = useCallback((text: string) => {
    continueNow.current = text;
    setContinueTextState(text);
  }, []);

  const [justSaved, setJustSaved] = useState<{ id: string; at: number } | null>(null);
  const [offer, setOffer] = useState<ContinuationOffer | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);

  const [ret, setRet] = useState<RecordReturn | null>(null);
  const [retLeaving, setRetLeaving] = useState(false);
  const [retRowId, setRetRowId] = useState<number | null>(null);
  const [rejectedGuesses, setRejectedGuesses] = useState<Record<string, boolean>>({});

  const [playingId, setPlayingId] = useState<string | null>(null);

  /** Ticks once a second only while something on screen is counting down. */
  const [, setTick] = useState(0);
  const countingDown = justSaved !== null || pendingRemoval !== null;
  useEffect(() => {
    if (!countingDown) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [countingDown]);

  /** And once a minute otherwise, so `today` becomes `yesterday` without a relaunch. */
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const now = nowFn();

  const readNow = useRef(readEnabled);
  readNow.current = readEnabled;
  const readGeneration = useRef(0);
  const previousRead = useRef(readEnabled);
  if (previousRead.current !== readEnabled) { ++readGeneration.current; previousRead.current = readEnabled; }

  const reload = useCallback(async () => {
    if (!readNow.current) return;
    const generation = readGeneration.current;
    try {
      const [rows, held, judged] = await Promise.all([
        store.loadRecord(),
        store.heldIds(),
        store.traceJudgements(),
      ]);
      if (!readNow.current || generation !== readGeneration.current) return;
      setMaterial(rows);
      setHeldIds(new Set(held));
      setJudgements(judged);
    } catch (error) { if (!(error instanceof RecordLocked)) throw error; }
  }, [store]);

  /* ------------------------------------------------------------------- playback */

  /**
   * The mark follows the sound. A recording that runs out puts itself away, and so does one
   * that could not start — nothing is left showing a stop mark over silence.
   *
   * A recording the native side could not find is written down as gone rather than kept as
   * a separate piece of screen state, so the row says `audio gone` the next time it is read
   * and goes on saying it.
   */
  useEffect(
    () =>
      audio.subscribe({
        onFinished: (id) => setPlayingId((current) => (current === id ? null : current)),
        onError: (id, code) => {
          if (code !== 'audio_missing') return;
          void store.markAudioMissing(id).then(reload);
        },
      }),
    [audio, store, reload]
  );

  /** Stops whatever is playing when the surface goes away, rather than talking to nobody. */
  useEffect(() => () => audio.stop(), [audio]);

  /**
   * Tapping the chip: start this one, or stop it if it is the one already playing. Starting
   * another stops the first — the port enforces that too, but the surface has to agree or
   * it would draw two things as playing.
   */
  const togglePlay = useCallback(
    async (m: Material) => {
      if (playingId === m.id) {
        audio.stop();
        setPlayingId(null);
        return;
      }
      const path = await store.audioPathOf(m.id);
      if (!path) {
        await store.markAudioMissing(m.id);
        await reload();
        return;
      }
      // Set before awaiting: the mark belongs to the tap, and a play that fails puts it
      // back a moment later through `onFinished`.
      setPlayingId(m.id);
      const playing = await audio.play(m.id, path);
      if (!playing) setPlayingId((current) => (current === m.id ? null : current));
    },
    [playingId, audio, store, reload]
  );

  useEffect(() => {
    if (!readEnabled) {
      setReady(false);
      return;
    }
    let alive = true;
    void (async () => {
      await reload();
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [reload, readEnabled]);

  useEffect(() => {
    if (!readEnabled) { audio.stop(); setPlayingId(null); }
  }, [audio, readEnabled]);

  /* ------------------------------------------------------------------ the Return */

  const returnVisible = !returnCovered && !input.length && !inputFocused && !anchor &&
    !focusId && !yearsOpen && selectedId === null;

  useEffect(() => {
    if (!ready || !readEnabled || retLeaving) return;
    if (ret) {
      const stillValid = !heldIds.has(ret.material.id) && resumeReturn({
        fragmentId: ret.material.id, reason: ret.reason, evidence: ret.evidence,
      }, material, nowFn());
      if (!stillValid) {
        if (retRowId !== null) void store.closeReturn(retRowId, 'expired').catch(() => {});
        setRet(null); setRetRowId(null);
      } else if (ret.material !== stillValid.material || ret.because !== stillValid.because) {
        setRet(stillValid);
      }
      return;
    }
    if (!returnVisible) return;
    let alive = true;
    const timer = setTimeout(() => {
      void (async () => {
        const status = await store.returnStatus();
        if (!alive) return;
        if (status.open) {
          const resumed = !heldIds.has(status.open.fragmentId)
            ? resumeReturn(status.open, material, nowFn()) : null;
          if (resumed) { setRet(resumed); setRetRowId(status.open.id); }
          else await store.closeReturn(status.open.id, 'expired');
          return;
        }
        if (status.lastAt !== null && nowFn() - status.lastAt < RETURN_COOLDOWN_MS) return;
        const recent = await store.recentlyReturned(SAME_FRAGMENT_COOLDOWN_MS);
        if (!alive) return;
        const candidate = returnFor({
          material, now: nowFn(), recentlyReturned: recent,
          held: Object.fromEntries([...heldIds].map((id) => [id, true])),
        });
        if (!candidate || !alive) return;
        const id = await store.recordReturn(candidate.material.id, candidate.reason, candidate.evidence);
        if (!alive || id === 0) return;
        setRet(candidate); setRetRowId(id);
      })().catch(() => { /* Capture remains available; the next material change retries. */ });
    }, RETURN_DELAY_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, [ready, readEnabled, material, heldIds, ret, retLeaving, retRowId, store, nowFn, returnVisible]);

  const clearReturn = useCallback(() => {
    setRet(null);
    setRetLeaving(false);
    setRetRowId(null);
  }, []);

  const openReturn = useCallback(() => {
    if (!ret || retLeaving || retRowId === null || !returnVisible || !readNow.current) return;
    const { reason, evidence } = ret;
    const fragmentId = ret.material.id;
    if (!resumeReturn({ fragmentId, reason, evidence }, material, nowFn())) return;
    setFocusTarget({ id: fragmentId, returned: { reason, evidence } });
    void store.closeReturn(retRowId, 'opened').catch(() => {});
    clearReturn();
  }, [ret, retLeaving, retRowId, returnVisible, material, nowFn, store, clearReturn]);

  const letGo = useCallback((animate: boolean) => {
    if (retLeaving || retRowId === null || !readNow.current) return;
    void store.closeReturn(retRowId, 'let_go').catch(() => {});
    if (animate) setRetLeaving(true);
    else clearReturn();
  }, [retLeaving, retRowId, store, clearReturn]);

  useEffect(() => {
    if (!retLeaving) return;
    const timer = setTimeout(clearReturn, motion.letGo);
    return () => clearTimeout(timer);
  }, [retLeaving, clearReturn]);

  /* ---------------------------------------------------------------------- Find */

  const field = readField(input);
  const query = field.mode === 'find' && field.active ? field.query : null;

  /* -------------------------------------------------------------------- capture */

  const submit = useCallback(async () => {
    const text = inputNow.current.trim();
    if (!text || text.startsWith('/')) return;

    // A typed date moves the record rather than landing in it. The three-way answer from
    // `parseAnchor` matters: `undefined` means "this is something someone wrote".
    const parsed = parseAnchor(text);
    if (parsed !== undefined) {
      setInput('');
      setAnchor(parsed ? resolveAnchor(parsed, material) : null);
      setSelectedId(null);
      setYearsOpen(false);
      return;
    }

    // Cleared before anything else happens: capture must never look like it is waiting.
    setInput('');
    const created = await store.capture({ body: text, origin: 'mobile' });
    await reload();

    thoughtLanded();
    setJustSaved({ id: created.id, at: nowFn() });
    setOffer(suggestContinuation(created, material, nowFn()));
    setSelectedId(null);
    void bridge.mirrorFragment(created.id);
    // `input` stays in the deps: the closure is still rebuilt as the field changes, and the
    // ref is what guarantees the value is current even when it has not been yet.
  }, [input, material, store, bridge, reload, nowFn, setInput]);

  /** The twelve seconds close on their own. */
  useEffect(() => {
    if (!justSaved) return;
    const id = setTimeout(() => {
      setJustSaved(null);
      setOffer(null);
    }, motion.editWindow);
    return () => clearTimeout(id);
  }, [justSaved]);

  const acceptOffer = useCallback(async () => {
    if (!offer || !justSaved) return;
    await store.linkContinuation(justSaved.id, offer.id);
    setOffer(null);
    await reload();
  }, [offer, justSaved, store, reload]);

  /* -------------------------------------------------------------------- removal */

  const remove = useCallback(
    async (m: Material) => {
      await store.remove(m.id);
      setPendingRemoval({ material: m, at: nowFn() });
      setSelectedId(null);
      if (focusId === m.id) setFocusId(null);
      await reload();
    },
    [store, reload, focusId, nowFn, setFocusId]
  );

  const bringBack = useCallback(async () => {
    if (!pendingRemoval) return;
    const restored = await store.bringBack(pendingRemoval.material.id);
    setPendingRemoval(null);
    if (restored) {
      await reload();
      void bridge.mirrorFragment(pendingRemoval.material.id);
    }
  }, [pendingRemoval, store, bridge, reload]);

  /**
   * The window closing is what publishes. Runs on a timer here and again at every launch
   * (see `RecordApp`), so a removal made just before the app was killed still goes.
   */
  useEffect(() => {
    if (!pendingRemoval) return;
    const elapsed = nowFn() - pendingRemoval.at;
    const id = setTimeout(
      async () => {
        const due = await store.dueRemovals();
        await bridge.publishDueRemovals(due);
        setPendingRemoval(null);
      },
      Math.max(0, motion.undoWindow - elapsed)
    );
    return () => clearTimeout(id);
  }, [pendingRemoval, store, bridge, nowFn]);

  const undoSecondsLeft = pendingRemoval
    ? Math.max(0, Math.ceil((motion.undoWindow - (now - pendingRemoval.at)) / 1000))
    : 0;

  /* ------------------------------------------------------------- hold / correct */

  /**
   * `keep present` is bounded and refuses rather than evicting — the shelf has no ordering,
   * so choosing what to drop would be the product choosing for somebody.
   *
   * Refusing is right; refusing in silence is not. The sixth press used to throw into a
   * floating promise and do nothing at all, which reads as a broken button rather than as a
   * full shelf.
   */
  const [holdRefused, setHoldRefused] = useState(false);

  const toggleHold = useCallback(
    async (m: Material) => {
      try {
        if (heldIds.has(m.id)) await store.release(m.id);
        else await store.hold(m.id);
      } catch (err) {
        if (!(err instanceof HoldLimitReached)) throw err;
        setHoldRefused(true);
        setTimeout(() => setHoldRefused(false), 5000);
        return;
      }
      setSelectedId(null);
      await reload();
    },
    [heldIds, store, reload]
  );

  const startCorrect = useCallback((m: Material) => {
    setEditingId(m.id);
    setEditText(m.body);
    setSelectedId(null);
    setFocusTarget((current) => current ?? { id: m.id });
  }, []);

  const saveCorrection = useCallback(async () => {
    if (!editingId) return;
    await store.correct(editingId, editNow.current);
    setEditingId(null);
    await reload();
    void bridge.mirrorFragment(editingId);
  }, [editingId, editText, store, bridge, reload]);

  /* ------------------------------------------------------------------- continue */

  const submitContinue = useCallback(async () => {
    const text = continueNow.current.trim();
    if (!text || !focusId) return;
    setContinueText('');
    setContinuing(false);
    const created = await store.continueFrom(focusId, { body: text, origin: 'mobile' });
    await reload();
    if (created) {
      thoughtLanded();
      setFocusId(created.id);
      void bridge.mirrorFragment(created.id);
    }
  }, [continueText, focusId, store, bridge, reload, setFocusId]);

  /* --------------------------------------------------------------------- traces */

  const openConnection = useCallback((id: string) => {
    setSelectedId(null);
    setFocusTarget({ id, fromConnection: true });
  }, []);

  /* ---------------------------------------------------------------- what to draw */

  const live = useMemo(() => material.filter((m) => m.removedAt === null), [material]);

  const focus = focusId ? (live.find((m) => m.id === focusId) ?? null) : null;
  const line = useMemo(() => (focus ? lineOf(focus, live) : []), [focus, live]);
  const returnContext = useMemo(() => {
    if (!readEnabled || !ready || !focus || !focusTarget?.returned) return null;
    return resumeReturn({ fragmentId: focus.id, ...focusTarget.returned }, live, nowFn());
  }, [readEnabled, ready, focus, focusTarget, live, nowFn]);

  const focusTraces: Trace[] = useMemo(
    () => (focus ? traces({ line, material: live, judgements, includeGuesses: false }) : []),
    [focus, line, live, judgements]
  );

  const held = useMemo(
    () => live.filter((m) => heldIds.has(m.id)),
    [live, heldIds]
  );

  const bands = useMemo(
    () =>
      bandsFor({
        material: live,
        now,
        anchor,
        query,
        // Held material sits above the record, so it is not also inside it — unless you are
        // standing somewhere or searching, when the record is showing you everything.
        exclude:
          anchor || query ? null : Object.fromEntries([...heldIds].map((id) => [id, true])),
      }),
    [live, now, anchor, query, heldIds]
  );

  const findCount = useMemo(
    () =>
      bands.reduce(
        (n, b) =>
          n + (b.type === 'years' ? b.years.reduce((m, y) => m + y.count, 0) : b.items.length),
        0
      ),
    [bands]
  );

  const guesses: Guess[] = useMemo(
    () => (query && findCount === 0 ? guessFor(query, live, now, rejectedGuesses) : []),
    [query, findCount, live, now, rejectedGuesses]
  );

  /** A D0 row states its Line; only D0 rows are asked, because only they show it. */
  const lines = useMemo(() => {
    const out: Record<string, { length: number; startedAt: number }> = {};
    const byLine = new Map<string, Material[]>();
    for (const m of live) {
      if (!m.lineId) continue;
      const list = byLine.get(m.lineId) ?? [];
      list.push(m);
      byLine.set(m.lineId, list);
    }
    for (const [, members] of byLine) {
      if (members.length < 2) continue;
      const startedAt = Math.min(...members.map((m) => m.at));
      for (const m of members) out[m.id] = { length: members.length, startedAt };
    }
    return out;
  }, [live]);

  const oldest = live.length ? live[live.length - 1] : null;

  const rows: Row[] = useMemo(
    () =>
      flattenRecord({
        bands,
        showReturn: Boolean(ret) && returnVisible,
        held: anchor || query ? [] : held,
        isEmptyRecord: ready && live.length === 0 && !query,
        findFoundNothing: Boolean(query) && findCount === 0,
        beginsLabel:
          !anchor && !query && oldest ? monthLabel(oldest.at, now, true) : null,
        anchor,
        now,
      }),
    [bands, ret, anchor, query, returnVisible, held, ready, live.length, findCount, oldest, now]
  );

  const highlight = useMemo(() => query ? [query] : [], [query]);

  return {
    ready,
    now,
    material: live,
    rows,
    held,
    heldIds,

    input,
    captureInput, setCaptureInput,
    setInput,
    startFind,
    leaveFind,
    finding,
    inputFocused,
    setInputFocused,
    submit,

    anchor,
    setAnchor,
    clearAnchor: () => setAnchor(null),
    anchorLabelFor: (a: Anchor) => monthLabel(new Date(a.y, a.m, 1).getTime(), now, true),
    standInYear: (year: number) => {
      setAnchor({ y: year, m: lastMonthWithData(live, year) });
      setYearsOpen(false);
    },
    standInMonth: (year: number, month: number) => {
      setAnchor({ y: year, m: month });
      setYearsOpen(false);
    },

    query,
    findCount,
    findSummaryText: query ? findSummary(findCount) : null,
    guesses,
    rejectGuess: (m: Material) =>
      setRejectedGuesses((r) => ({ ...r, [m.id]: true })),

    selectedId,
    setSelectedId,
    focus,
    focusId,
    setFocusId,
    openExisting,
    line,
    focusTraces,
    unfolded,
    unfold: () => setUnfolded(true),
    yearsOpen,
    setYearsOpen,
    years: useMemo(() => yearsSummary(live), [live]),

    editingId,
    editText,
    setEditText,
    startCorrect,
    saveCorrection,
    cancelCorrection: () => setEditingId(null),
    shownPrevious,
    togglePrevious: (id: string) =>
      setShownPrevious((s) => ({ ...s, [id]: !s[id] })),

    continuing,
    continueText,
    setContinueText,
    startContinue: () => setContinuing(true),
    submitContinue,
    stopContinue: () => setContinuing(false),

    justSavedId: justSaved?.id ?? null,
    editSecondsLeft: justSaved
      ? Math.max(0, Math.ceil((motion.editWindow - (now - justSaved.at)) / 1000))
      : 0,
    offer,
    acceptOffer,
    rejectOffer: () => setOffer(null),

    pendingRemoval,
    undoSecondsLeft,
    undoLabel: pendingRemoval ? truncate(firstLine(pendingRemoval.material), 32) : '',
    remove,
    bringBack,

    toggleHold,
    holdRefused,
    maxHeld: MAX_HELD,
    openConnection,

    ret,
    retLeaving,
    openReturn,
    letGo,
    returnContext,
    positionAtMoment: Boolean(focusTarget?.returned || focusTarget?.fromConnection),

    playingId,
    setPlayingId,
    togglePlay,
    lines,
    highlight,
    reload,
  };
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
