/**
 * Chinotto: one surface with an edge at the bottom, and everything else pushed over it.
 *
 * There is no navigation stack and no tab bar, because there is one place. Focus, the years,
 * settings, sync, the share sheet and the forced-update gate are all overlays on the record,
 * and each of them can be left the way it was entered.
 *
 * The order of what is drawn matters and is the prototype's:
 *
 *     status bar (z 3) · pull strip (z 3) · the record · the edge (z 2)
 *     focus / settings (z 4) · years (z 5) · share (z 6) · launch (z 20)
 */

import { QuietGuideIcon } from './ui/QuietGuideIcon';
import { useRecordStatusBar, useRecordTheme } from './ui/appearance';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';

import {
  Edge,
  useReducedMotion,
  type EdgeNotice,
  type VoiceCaptureDisplayState,
} from './ui/Edge';
import { dismissKeyboard, useKeyboardInset } from './ui/useKeyboardInset';
import { Focus, type QuietScrollPosition } from './ui/Focus';
import { Launch, launchHoldFor } from './ui/Launch';
import { Mark } from './ui/Mark';
import { RecordList } from './ui/RecordList';
import { ReturnBlock } from './ui/ReturnBlock';
import { YearsOverlay } from './ui/YearsOverlay';
import { frame } from './ui/tokens';
import { hasFoundSettings, rememberFoundSettings } from './pullHint';
import { type } from './ui/type';
import { useRecord } from './useRecord';
import { LockedCapture } from './ui/LockedCapture';
import { RecordOpening } from './ui/record-opening';
import { recordBackStep } from './back';
import { capabilitiesFor, type PlatformCapabilities } from './platform';
import { displayText, firstLine, type Material } from './model/material';
import { dayLabel, fmtTime, monthLabel } from './model/time';
import type { RecordBridge } from './bridge';
import type { AudioPlaybackPort } from './playback';
import type { RecordStore } from './store';
import { RecordLocked } from './privacy';
import type { Reminders, ThoughtReminder } from './reminders';
import type { ReturnAlerts } from './returnAlerts';
import { reminderDate, reminderTime } from './reminderTime';
import { ReminderSheet, reminderDraft, type ReminderDraft } from './ui/ReminderSheet';

export type ReminderOpenRequest = { id: string; source: 'notification' | 'scheduled' | 'return-alert' | 'widget' };

export type RecordAppProps = {
  store: RecordStore;
  privacy?: { locked: boolean; busy: boolean; error: string | null; onUnlock: () => void };
  bridge: RecordBridge;
  reminders?: Reminders;
  returnAlerts?: ReturnAlerts;
  returnAlertsChanged?: number;
  remindersChanged?: number;
  reminderRequest?: ReminderOpenRequest | null;
  onReminderHandled?: (request: ReminderOpenRequest, consume: boolean) => void;
  onReturnToScheduled?: () => void;
  /** False on a warm resume, so the lockup plays once per cold start and no more. */
  coldStart: boolean;
  returnCovered?: boolean;
  onOpenSettings: () => void;
  onOpenQuietGuide?: () => void;
  /** Existing capture links focus this edge; Quiet uses its own return destination. */
  captureRequest?: number;
  /** Press-to-record. Release keeps it; slide up locks it; discard leaves no moment behind. */
  voice: {
    start: () => Promise<boolean>;
    stop: () => Promise<void>;
    cancel: () => Promise<void>;
    state: VoiceCaptureDisplayState | null;
    permission: 'granted' | 'ask' | 'denied';
    requestPermission: () => Promise<'granted' | 'denied'>;
    openSystemSettings: () => void;
  };
  voiceIssue?: string | null;
  /** Playing a voice moment back. Absent on a platform that cannot, and then it is not offered. */
  audio?: AudioPlaybackPort;
  /**
   * The widget's `mode=voice`: open listening rather than typing.
   *
   * It goes through the same door the circle does, so it gets the same permission handling
   * — the alternative was a start that failed silently for anybody who had said no.
   */
  voiceOnOpen?: boolean;
  onVoiceOnOpenHandled?: () => void;
  /**
   * Bumped by anything that writes to the record from outside this surface — a voice
   * capture settling, a share landing. The record reads itself again when it moves.
   */
  changedAt?: number;
  sync: {
    notice: { text: string; urgent: boolean } | null;
    onOpen: () => void;
  };
  update: {
    soft: boolean;
    /** The version the store has; null when it is not known. */
    availableVersion: string | null;
    onUpdate: () => void;
    onLater: () => void;
  };
  /** What this phone can do. Defaults to the platform's own answer. */
  capabilities?: PlatformCapabilities;
  /**
   * Where the app's back handler reaches the record's own layers. Set on every render to a
   * function that puts away the top-most one and says whether there was one. See `back.ts`.
   */
  backRef?: React.MutableRefObject<(() => boolean) | null>;
};

export function RecordApp(props: RecordAppProps) {
  const { ink, SURFACE } = useRecordTheme();
  useRecordStatusBar(props.privacy?.busy ?? false);

  const [active, setActive] = useState(() => !AppState.currentState || AppState.currentState === 'active');
  const captureInProgress = Boolean(props.captureRequest || props.voiceOnOpen || props.voice.state);
  const [showLaunch, setShowLaunch] = useState(props.coldStart);
  const launchVisible = showLaunch && !captureInProgress;
  const returnCovered = Boolean(props.returnCovered || !active || launchVisible || props.voice.state || props.reminderRequest);
  const record = useRecord(props.store, props.bridge, undefined, props.audio, !props.privacy?.locked, returnCovered);
  const capabilities = props.capabilities ?? capabilitiesFor(Platform.OS);

  const { reminders, returnAlerts, reminderRequest, onReminderHandled } = props;
  const [editor, setEditor] = useState<ReminderDraft | null>(null);
  const [editingFromScheduled, setEditingFromScheduled] = useState(false);
  const [scheduledReminder, setScheduledReminder] = useState<ThoughtReminder | null>(null);
  const [reminderNotice, setReminderNotice] = useState<{ text: string; fragmentId: string | null } | null>(null);
  const [reminderArrival, setReminderArrival] = useState<string | null>(null);
  const focusedId = record.focus?.id;
  const locked = props.privacy?.locked ?? false;
  const { openExisting, clearReturn } = record;
  const isAuthoring = Boolean(record.editingId || record.continuing || props.voice.state);
  const editorOpen = Boolean(editor && editor.fragmentId === focusedId);
  const quietPosition = useRef<QuietScrollPosition>({ normal: 0, quiet: 0, restore: null });

  const enterQuietReading = (offset: number) => {
    quietPosition.current = { normal: offset, quiet: offset, restore: null };
    if (record.playingId !== null) {
      props.audio?.stop();
      record.setPlayingId(null);
    }
    record.setQuietReading(true);
  };

  const exitQuietReading = () => {
    quietPosition.current.restore = quietPosition.current.normal;
    record.setQuietReading(false);
  };

  useEffect(() => {
    if (!reminders || !focusedId || locked) return;
    let current = true;
    void reminders.get(focusedId).then(
      (reminder) => { if (current) setScheduledReminder(reminder); },
      () => { if (current) setScheduledReminder(null); },
    );
    return () => { current = false; };
  }, [focusedId, locked, reminders, props.remindersChanged]);

  useEffect(() => {
    if (!returnAlerts || locked || !record.ready || !active) return;
    void returnAlerts.reconcile(props.store).catch(() => {});
  }, [returnAlerts, active, locked, record.ready, record.ret, record.retLeaving,
    record.material, record.heldIds, props.store, props.returnAlertsChanged]);

  useEffect(() => {
    if (!reminderRequest || !record.ready || locked || isAuthoring || editorOpen) return;
    let current = true;
    void (async () => {
      try {
        if (reminderRequest.source === 'widget' || reminderRequest.source === 'return-alert') {
          const fromReturn = reminderRequest.source === 'return-alert';
          const returned = fromReturn ? await returnAlerts?.open(reminderRequest.id, props.store, () => current) : null;
          const thought = fromReturn ? returned?.material : await props.store.getFragment(reminderRequest.id);
          if (!current) return;
          if (thought && thought.removedAt === null) {
            openExisting(thought, returned ?? undefined);
            if (returned) clearReturn();
            setReminderArrival(null);
            setReminderNotice(null);
          } else {
            setReminderNotice({
              text: fromReturn ? 'this return is no longer available' : 'this thought is no longer available',
              fragmentId: null,
            });
          }
          onReminderHandled?.(reminderRequest, false);
          return;
        }
        if (!reminders) return;
        const reminder = await reminders.resolve(reminderRequest.id);
        const thought = reminder ? await props.store.getFragment(reminder.fragmentId) : null;
        if (!current) return;
        const fromNotification = reminderRequest.source === 'notification';
        const dueInApp = reminder?.delivery === 'in-app' && reminder.at <= Date.now();
        if (thought && thought.removedAt == null && reminder) {
          openExisting(thought);
          setReminderNotice(null);
          const manage = !fromNotification && !dueInApp;
          setReminderArrival(manage ? null : thought.id);
          if (manage) {
            setScheduledReminder(reminder);
            setEditingFromScheduled(true);
            setEditor(reminderDraft(thought.id, reminder));
          }
        } else {
          setReminderNotice({ text: 'this reminder is no longer available', fragmentId: null });
        }
        onReminderHandled?.(reminderRequest, fromNotification || dueInApp);
      } catch (error) {
        if (current && !(error instanceof RecordLocked)) {
          const text = reminderRequest.source === 'widget' ? 'could not open this thought'
            : reminderRequest.source === 'return-alert' ? 'could not open this return'
              : 'could not open this reminder';
          setReminderNotice({ text, fragmentId: null });
          onReminderHandled?.(reminderRequest, false);
        }
      }
    })();
    return () => { current = false; };
  }, [active, clearReturn, editorOpen, isAuthoring, locked, onReminderHandled, openExisting,
    props.store, record.ready, reminderRequest, reminders, returnAlerts]);


  const closeReminder = () => {
    setEditor(null);
    if (!editingFromScheduled) return;
    setEditingFromScheduled(false);
    record.setFocusId(null);
    props.onReturnToScheduled?.();
  };

  if (props.backRef) {
    props.backRef.current = () => {
      if (locked) return false;
      if (editorOpen) { closeReminder(); return true; }
      const step = recordBackStep({
        yearsOpen: record.yearsOpen,
        focusOpen: Boolean(record.focus),
        correcting: record.editingId !== null,
        continuing: record.continuing,
        quietReading: record.quietReading,
        anchored: Boolean(record.anchor),
        selected: record.selectedId !== null,
        finding: record.finding,
      });
      switch (step) {
        case 'close-years':
          record.setYearsOpen(false);
          return true;
        case 'cancel-correction':
          record.cancelCorrection();
          return true;
        case 'exit-quiet-reading':
          exitQuietReading();
          return true;
        case 'stop-continue':
          record.stopContinue();
          return true;
        case 'close-focus':
          setReminderArrival(null);
          record.setFocusId(null);
          return true;
        case 'leave-find':
          record.leaveFind();
          return true;
        case 'clear-anchor':
          record.clearAnchor();
          return true;
        case 'clear-selection':
          record.setSelectedId(null);
          return true;
        default:
          return false;
      }
    };
  }
  const reducedMotion = useReducedMotion();
  const keyboardInset = useKeyboardInset();

  /**
   * How tall the edge is right now, so the record can stop short of it.
   *
   * Starts at the design's own figure — the height of an idle edge — and is corrected by
   * the first layout, so nothing moves at launch and nothing is covered afterwards.
   */
  const [edgeHeight, setEdgeHeight] = useState<number>(frame.bottom);

  /** Shown until the pull has worked once. See `record/pullHint.ts`. */
  const [showPullHint, setShowPullHint] = useState(false);
  useEffect(() => {
    let alive = true;
    void hasFoundSettings().then((found) => {
      if (alive && !found) setShowPullHint(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Reading again is cheap and being wrong is not: a moment that exists and is not drawn
  // reads as a capture that was lost. The first value is skipped — that is the initial load.
  const changedAt = props.changedAt ?? 0;
  useEffect(() => {
    if (changedAt > 0) void record.reload();
    // `record.reload` is stable for a given store; depending on it would reload on nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changedAt]);

  const inputRef = useRef<TextInputInstance>(null);
  useEffect(() => {
    if (!props.captureRequest) return;
    record.clearAnchor();
    record.leaveFind();
    record.setFocusId(null);
    record.setSelectedId(null);
    record.setYearsOpen(false);
    inputRef.current?.focus();
    // One focus per explicit capture request, never per render or saved thought.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.captureRequest]);

  const [launchLeaving, setLaunchLeaving] = useState(false);
  /** Once per mount, whatever the prop does afterwards. */
  const launchPlayed = useRef(props.coldStart);
  const [micNotice, setMicNotice] = useState<'ask' | 'denied' | null>(null);

  /* ------------------------------------------------------------------- launch */

  const dismissLaunch = useCallback(() => {
    setLaunchLeaving(true);
  }, []);

  // Launch's exit animation must keep the same completion callback across Record updates.
  const finishLaunch = useCallback(() => setShowLaunch(false), []);

  /**
   * The lockup waits for the fonts, so `coldStart` arrives false and turns true a moment
   * later — it is `coldStart && fontsReady`, and the record is drawn before either. Reading
   * it only as initial state meant the lockup never played at all on a real launch: by the
   * time it was true, nothing was looking. It is latched here instead, once per mount.
   */
  useEffect(() => {
    if (captureInProgress) {
      // A widget request can precede font loading, or arrive halfway through the animation.
      launchPlayed.current = true;
      finishLaunch();
      return;
    }
    if (!props.coldStart || launchPlayed.current) return;
    launchPlayed.current = true;
    setShowLaunch(true);
  }, [props.coldStart, captureInProgress, finishLaunch]);

  useEffect(() => {
    if (!launchVisible) return;
    // Count from when the lockup appears. On a production cold start, font loading can take
    // longer than the whole animation; subtracting that time hid the maker line completely.
    const hold = launchHoldFor(reducedMotion);
    const id = setTimeout(dismissLaunch, hold);
    return () => clearTimeout(id);
  }, [launchVisible, reducedMotion, dismissLaunch]);

  /**
   * Any removal whose eight seconds elapsed while the app was closed is published now. This
   * is the other half of the deferral: the window is a promise to the person, not a promise
   * to the process.
   */
  useEffect(() => {
    let alive = true;
    const flush = async () => {
      const due = await props.store.dueRemovals();
      if (alive && due.length) await props.bridge.publishDueRemovals(due);
    };
    void flush();
    const sub = AppState.addEventListener('change', (state) => {
      setActive(state === 'active');
      if (state === 'active') void flush();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [props.store, props.bridge]);

  /* -------------------------------------------------------------------- voice */

  /**
   * A second tap may arrive while the phone is still opening the microphone. `stop()` cannot
   * stop a future engine, so the intent is replayed after `start()` settles as well.
   */
  const openingVoice = useRef<Promise<boolean> | null>(null);
  const requestingPermission = useRef<Promise<'granted' | 'denied'> | null>(null);
  const finishAfterOpen = useRef<'keep' | 'discard' | null>(null);

  const startRecording = useCallback(async () => {
    if (openingVoice.current || requestingPermission.current || props.voice.state) return;
    // Speaking is not typing. The keyboard goes away so the recording has the
    // whole edge, which is what the veil and the level meter are drawn against.
    dismissKeyboard();
    if (props.voice.permission === 'denied') {
      setMicNotice('denied');
      // It clears itself. A permission notice that had to be dismissed would be a dialog.
      setTimeout(() => setMicNotice(null), 7000);
      return;
    }
    // A permission prompt is preparation, not a recording. Starting capture behind the
    // system sheet meant its eventual answer inherited the original touch and silently
    // created the first voice moment. The next deliberate tap/hold is the first recording.
    if (props.voice.permission === 'ask') {
      setMicNotice('ask');
      setTimeout(() => setMicNotice(null), 7000);
      const request = props.voice.requestPermission();
      requestingPermission.current = request;
      const permission = await request;
      if (requestingPermission.current === request) requestingPermission.current = null;
      if (permission === 'denied') {
        setMicNotice('denied');
        setTimeout(() => setMicNotice(null), 7000);
      } else {
        setMicNotice(null);
      }
      return;
    }
    setMicNotice(null);
    const opening = props.voice.start();
    openingVoice.current = opening;
    const started = await opening;
    if (openingVoice.current === opening) openingVoice.current = null;
    const finish = finishAfterOpen.current;
    finishAfterOpen.current = null;
    if (started && finish) {
      await (finish === 'discard' ? props.voice.cancel() : props.voice.stop());
    }
  }, [props.voice]);

  const stopRecording = useCallback(async () => {
    if (openingVoice.current) finishAfterOpen.current = 'keep';
    await props.voice.stop();
  }, [props.voice]);

  const cancelRecording = useCallback(async () => {
    // Mark it discarded now, before a fast native final can arrive, then repeat after a
    // pending open so a microphone that was not live yet is also actually stopped.
    if (openingVoice.current) finishAfterOpen.current = 'discard';
    await props.voice.cancel();
  }, [props.voice]);

  /**
   * The widget asked to toggle listening. A second widget tap can reach a foreground app
   * just like a second circle tap, so every entrance to voice keeps the same start/stop
   * promise instead of silently asking an already-running recorder to start again.
   */
  useEffect(() => {
    if (!props.voiceOnOpen) return;
    // A link asking for listening, on a phone that cannot listen, opens the edge for typing.
    if (!capabilities.voice) {
      props.onVoiceOnOpenHandled?.();
      return;
    }
    const id = setTimeout(() => {
      if (props.voice.state) void stopRecording();
      else void startRecording();
      // Acknowledging earlier lets the parent clear voiceOnOpen and cancel this timer
      // before the cold-start request has actually reached the recorder.
      props.onVoiceOnOpenHandled?.();
    }, 320);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.voiceOnOpen]);

  /* ------------------------------------------------------------------ notices */

  const notices: EdgeNotice[] = [];
  if (micNotice) {
    notices.push({
      kind: 'mic',
      text:
        micNotice === 'denied'
          ? `chinotto can’t hear — the microphone is off for it in ${capabilities.systemName} settings.`
          : `${capabilities.systemName} will ask once whether chinotto may hear you.`,
      // Nothing to offer while the system is the one asking — the notice is saying what is about
      // to happen, not standing in front of it.
      action: micNotice === 'denied' ? 'open settings ›' : undefined,
      onAction:
        micNotice === 'denied'
          ? () => {
              props.voice.openSystemSettings();
              setMicNotice(null);
            }
          : undefined,
    });
  }
  if (reminderNotice && reminderNotice.fragmentId === null) {
    notices.push({ kind: 'reminder', text: reminderNotice.text });
  }
  if (props.voiceIssue) {
    notices.push({ kind: 'mic', text: props.voiceIssue });
  }
  if (record.holdRefused) {
    notices.push({
      kind: 'held',
      text: `already keeping ${record.maxHeld} present · let one go first`,
    });
  }
  if (record.pendingRemoval) {
    notices.push({
      kind: 'undo',
      text: record.undoLabel,
      secondsLeft: record.undoSecondsLeft,
      onUndo: record.bringBack,
    });
  }
  if (props.sync.notice) {
    notices.push({
      kind: 'sync',
      text: props.sync.notice.text,
      urgent: props.sync.notice.urgent,
      onOpen: props.sync.onOpen,
    });
  }
  // No version, no notice: the line names a version, and naming the wrong one is worse
  // than staying quiet.
  if (props.update.soft && props.update.availableVersion) {
    notices.push({
      kind: 'update',
      version: props.update.availableVersion,
      onUpdate: props.update.onUpdate,
      onLater: props.update.onLater,
    });
  }

  /* --------------------------------------------------------------- the record */

  // The capture field belongs to the edge. Once a moment is open, the edge is not the
  // surface in front of anybody any more, so a keyboard raised for it goes too — otherwise
  // it sits over Focus with its caret in a field nobody can see.
  useEffect(() => {
    if (record.focusId) dismissKeyboard();
  }, [record.focusId]);

  const removeMoment = async (moment: Material) => {
    await record.remove(moment);
    void reminders?.reconcile().catch(() => {});
  };

  useEffect(() => {
    if (reminderNotice?.fragmentId !== null) return;
    const timer = setTimeout(() => setReminderNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [reminderNotice]);

  const tapMoment = useCallback(
    (m: Material, tier: number) => {
      // D0 asks once before it acts: the first tap selects and opens the verbs, the second
      // opens the moment. Everything further back opens straight away — there is nothing to
      // act on at a distance.
      if (tier === 0 && record.selectedId !== m.id) {
        record.setSelectedId(m.id);
        return;
      }
      record.setSelectedId(null);
      record.setFocusId(m.id);
    },
    [record]
  );

  if (props.privacy?.locked) return <LockedCapture
    words={record.captureInput} change={record.setCaptureInput}
    capture={(body) => props.store.capture({ body, origin: 'mobile' })}
    onUnlock={props.privacy.onUnlock} busy={props.privacy.busy} error={props.privacy.error}
    onSettings={props.onOpenSettings}
    onOpenQuietGuide={props.onOpenQuietGuide}
    voice={{ recording: props.voice.state, voice: capabilities.voice,
      onStartRecording: () => void startRecording(), onStopRecording: stopRecording,
      onCancelRecording: cancelRecording }} />;

  return (
    <View
      style={{ flex: 1, backgroundColor: SURFACE }}
      // The launch lockup is not modal, so the first touch anywhere ends it.
      onStartShouldSetResponderCapture={() => {
        if (launchVisible && !launchLeaving) dismissLaunch();
        return false;
      }}
    >
      {/*
        Chinotto's own temporal orientation, and nothing else.

        The prototype draws a clock and a signal/battery glyph here because it is a browser
        mock of a phone. On a phone, iOS owns that row — drawing our own clock put two of
        them on screen at once. So this says only the thing iOS cannot: where in the record
        you are standing, and how to come back.
      */}
      {record.anchor && !record.quietReading ? (
        <View
          style={{
            position: 'absolute',
            left: 24,
            right: 24,
            top: frame.statusBarHeight,
            alignItems: 'flex-end',
            zIndex: 3,
          }}
          pointerEvents="box-none"
        >
          <Text
            onPress={record.clearAnchor}
            accessibilityRole="button"
            style={type({ size: 12, width: 90, color: ink.meta })}
          >
            {`▲ today · you are in ${record.anchorLabelFor(record.anchor)}`}
          </Text>
        </View>
      ) : null}

      {/* pull down for the instrument's own register */}
      <PullStrip
        onOpen={() => {
          setShowPullHint(false);
          void rememberFoundSettings();
          props.onOpenSettings();
        }}
        hint={showPullHint}
        disabled={Boolean(record.focus)}
      />

      {props.onOpenQuietGuide && !record.focus && !record.anchor ? <Pressable
        accessibilityRole="button" accessibilityLabel="Quiet Home Screen guide" onPress={() => { dismissKeyboard(); props.onOpenQuietGuide?.(); }}
        style={{ position: 'absolute', right: 24, top: frame.statusBarHeight - 5, minHeight: 44,
          justifyContent: 'center', alignItems: 'flex-end', minWidth: 44, zIndex: 4, backgroundColor: SURFACE }}>
        <QuietGuideIcon />
      </Pressable> : null}

      {props.privacy && !record.ready ? (
        <Animated.View style={{ flex: 1, justifyContent: 'center', paddingBottom: keyboardInset }}>
          <RecordOpening reducedMotion={reducedMotion} />
        </Animated.View>
      ) : <RecordList
        accessibilityHidden={record.quietReading}
        keyboardInset={keyboardInset}
        voice={capabilities.voice}
        edgeHeight={edgeHeight}
        rows={record.rows}
        now={record.now}
        highlight={record.highlight}
        selectedId={record.selectedId}
        justSavedId={record.justSavedId}
        editSecondsLeft={record.editSecondsLeft}
        continuationOffer={record.offer ? { text: record.offer.text } : null}
        playingId={record.playingId}
        heldIds={record.heldIds}
        lines={record.lines}
        onTapMoment={tapMoment}
        onPlay={(m) => void record.togglePlay(m)}
        onContinue={(m) => {
          record.setSelectedId(null);
          record.setFocusId(m.id);
          record.startContinue();
        }}
        onHold={record.toggleHold}
        onCorrect={record.startCorrect}
        onRemove={removeMoment}
        onAcceptContinuation={record.acceptOffer}
        onRejectContinuation={record.rejectOffer}
        onOpenYears={() => record.setYearsOpen(true)}
        onStandInYear={record.standInYear}
        renderReturn={() =>
          record.ret ? (
            <ReturnBlock
              value={record.ret}
              now={record.now}
              leaving={record.retLeaving}
              reducedMotion={reducedMotion}
              onOpen={record.openReturn}
              onLetGo={() => record.letGo(!reducedMotion)}
            />
          ) : null
        }
        renderFindEmpty={() => (
          <View style={{ gap: 16, marginBottom: 22 }}>
            <Text style={type({ size: 16, width: 90, lineHeight: 1.4, color: ink.far })}>
              {record.guesses.length
                ? 'nothing with those words. shared words, maybe:'
                : 'nothing with those words.'}
            </Text>
            {record.guesses.map((g) => (
              <View key={g.material.id} style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable style={{ flex: 1 }} onPress={() => record.setFocusId(g.material.id)}>
                  <Text
                    style={type({
                      size: 16,
                      width: 88,
                      lineHeight: 1.3,
                      italic: true,
                      color: ink.near,
                    })}
                  >
                    {firstLine(g.material)}
                  </Text>
                  <Text
                    style={[type({ size: 12, width: 90, color: ink.meta }), { marginTop: 2 }]}
                  >
                    {g.when} · {g.overlap} shared {g.overlap === 1 ? 'word' : 'words'}
                  </Text>
                </Pressable>
                <Text
                  onPress={() => record.rejectGuess(g.material)}
                  style={[type({ size: 12, width: 90, color: ink.meta }), { paddingTop: 4 }]}
                >
                  not this
                </Text>
              </View>
            ))}
          </View>
        )}
      />}

      <Edge
        accessibilityHidden={record.quietReading}
        input={record.input}
        onChangeInput={record.setInput}
        onSubmit={record.submit}
        inputRef={inputRef}
        focused={record.inputFocused}
        onFocus={() => record.setInputFocused(true)}
        onBlur={() => record.setInputFocused(false)}
        onPressCaret={() => inputRef.current?.focus()}
        anchored={Boolean(record.anchor)}
        onClearAnchor={record.clearAnchor}
        findSummary={record.findSummaryText}
        onFind={() => { record.startFind(); inputRef.current?.focus(); }}
        onLeaveFind={() => { record.leaveFind(); inputRef.current?.focus(); }}
        recording={props.voice.state}
        voice={capabilities.voice}
        onStartRecording={() => void startRecording()}
        onStopRecording={stopRecording}
        onCancelRecording={cancelRecording}
        notices={notices}
        keyboardInset={keyboardInset}
        onHeightChange={setEdgeHeight}
      />

      {record.focus && (!props.privacy || record.ready) ? (
        <Focus
          focus={record.focus}
          line={record.line}
          now={record.now}
          unfolded={record.unfolded}
          onUnfold={record.unfold}
          selectedId={record.selectedId}
          onSelect={record.setSelectedId}
          editingId={record.editingId}
          editText={record.editText}
          onChangeEditText={record.setEditText}
          onSaveEdit={record.saveCorrection}
          onCancelEdit={record.cancelCorrection}
          onCorrect={record.startCorrect}
          shownPrevious={record.shownPrevious}
          onTogglePrevious={record.togglePrevious}
          heldIds={record.heldIds}
          onHold={record.toggleHold}
          onRemove={removeMoment}
          fromReminder={record.focus.id === reminderArrival}
          positionAtMoment={record.positionAtMoment}
          returnContext={record.returnContext}
          reducedMotion={reducedMotion}
          quietReading={record.quietReading}
          quietPosition={quietPosition}
          onEnterQuietReading={enterQuietReading}
          onExitQuietReading={exitQuietReading}
          reminderEditorOpen={editorOpen}
          reminder={reminders ? {
            label: scheduledReminder?.fragmentId === record.focus.id
              ? `reminder · ${reminderDate(scheduledReminder.at)} · ${reminderTime(scheduledReminder.at)}` : 'remind me',
            notice: reminderNotice?.fragmentId === record.focus.id ? reminderNotice.text : null,
            onOpen: () => {
              if (!focusedId) return;
              const id = focusedId;
              setReminderNotice(null);
              void reminders.get(id).then((saved) => setEditor(reminderDraft(id, saved)), () => {
                setReminderNotice({ text: 'could not read this reminder', fragmentId: id });
              });
            },
          } : undefined}
          playingId={record.playingId}
          onPlay={(m) => void record.togglePlay(m)}
          traces={record.focusTraces}
          onOpenTrace={(m) => record.setFocusId(m.id)}
          connections={record.ready && !editorOpen ? {
            material: record.material,
            rejections: props.store.connectionRejections,
            dismiss: (source, related) => props.store.judgeTrace(source, related, 'connection', 'rejected'),
            onReadRelated: record.openConnection,
          } : undefined}
          continuing={record.continuing}
          continueText={record.continueText}
          onChangeContinueText={record.setContinueText}
          onStartContinue={record.startContinue}
          onSubmitContinue={record.submitContinue}
          onClose={() => {
            record.setFocusId(null);
            setReminderArrival(null);
            record.stopContinue();
            record.cancelCorrection();
          }}
        />
      ) : null}

      {editor && editorOpen && reminders ? (
        <ReminderSheet
          draft={editor}
          change={setEditor}
          reminders={reminders}
          close={closeReminder}
          done={(saved, notice) => {
            setScheduledReminder(saved);
            setReminderNotice(notice ? { text: notice, fragmentId: editor.fragmentId } : null);
            closeReminder();
          }}
          openSettings={props.voice.openSystemSettings}
        />
      ) : null}

      {record.yearsOpen ? (
        <YearsOverlay
          years={record.years}
          onStandInMonth={record.standInMonth}
          onStandInYear={record.standInYear}
          onClose={() => record.setYearsOpen(false)}
        />
      ) : null}

      {launchVisible ? (
        <Launch
          leaving={launchLeaving}
          reducedMotion={reducedMotion}
          onFinished={finishLaunch}
        />
      ) : null}
    </View>
  );
}

/**
 * Settings has one way in: a pull from just under the status bar.
 *
 * The strip starts at 54pt rather than at 0 so it never competes with the system's own
 * pull-down, and it is the only chrome the record carries.
 */
/**
 * The grab strip at the top, and the one thing on screen that says it is there.
 *
 * It used to draw nothing until it was already being pulled, which made settings — and so
 * sync, the account, the devices, everything behind it — unreachable for anybody who had
 * not been told. The mark rests there quietly as the handle; the words stay beside it only
 * until the pull has worked once.
 */
function PullStrip({
  onOpen,
  disabled,
  hint,
}: {
  onOpen: () => void;
  disabled: boolean;
  /** Whether this person has yet to find settings. */
  hint: boolean;
}) {
  const { ink, agency, LIVE } = useRecordTheme();

  const [pull, setPull] = useState(0);
  const start = useRef(0);

  if (disabled) return null;

  const pulling = pull > frame.pullReveal;

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: frame.statusBarHeight,
        height: frame.pullStripHeight,
        zIndex: 3,
      }}
      testID="pull-strip"
      accessible
      accessibilityRole="button"
      accessibilityLabel="Settings"
      accessibilityHint="Pull down or activate to open Settings"
      accessibilityActions={[{ name: 'activate', label: 'Open Settings' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'activate') onOpen();
      }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => {
        start.current = e.nativeEvent.pageY;
        setPull(0);
      }}
      onResponderMove={(e) => {
        const dy = Math.max(0, e.nativeEvent.pageY - start.current);
        setPull(dy);
        if (dy > frame.pullThreshold) {
          setPull(0);
          onOpen();
        }
      }}
      onResponderRelease={() => setPull(0)}
      onResponderTerminate={() => setPull(0)}
    >
      <View
        style={{
          position: 'absolute',
          left: 24,
          right: 24,
          top: 0,
          height: pulling ? Math.min(96, pull) : frame.pullStripHeight,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 11,
          // The mark is a quiet cream landmark; the instructional copy stays subdued.
          // Under the finger the mark comes up one final step.
          opacity: pulling ? Math.min(1, pull / 40) : 1,
        }}
        pointerEvents="none"
      >
        <Mark size={pulling ? 24 : 20} color={pulling ? agency.ink : LIVE} />
        {pulling || hint ? (
          <Text
            style={type({ size: 14, width: 90, color: ink.meta })}
          >
            {pull > frame.pullThreshold ? 'settings' : 'pull for settings'}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Re-exported for the surfaces that need to say when something was. */
export { dayLabel, monthLabel, displayText };
