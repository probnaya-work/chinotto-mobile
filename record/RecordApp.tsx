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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Pressable,
  StatusBar,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
} from 'react-native';

import { Edge, useReducedMotion, type EdgeNotice } from './ui/Edge';
import { dismissKeyboard, useKeyboardInset } from './ui/useKeyboardInset';
import { Focus } from './ui/Focus';
import { Launch, launchHoldFor } from './ui/Launch';
import { Mark } from './ui/Mark';
import { RecordList } from './ui/RecordList';
import { ReturnBlock } from './ui/ReturnBlock';
import { YearsOverlay } from './ui/YearsOverlay';
import { frame, ink, SURFACE } from './ui/tokens';
import { hasFoundSettings, rememberFoundSettings } from './pullHint';
import { type } from './ui/type';
import { useRecord } from './useRecord';
import { displayText, firstLine, type Material } from './model/material';
import { dayLabel, fmtTime, monthLabel } from './model/time';
import type { RecordBridge } from './bridge';
import type { AudioPlaybackPort } from './playback';
import type { RecordStore } from './store';

export type RecordAppProps = {
  store: RecordStore;
  bridge: RecordBridge;
  /** False on a warm resume, so the lockup plays once per cold start and no more. */
  coldStart: boolean;
  onOpenSettings: () => void;
  /** Hold-to-speak. Returns what was recorded, or null if it was too short to keep. */
  voice: {
    start: () => Promise<boolean>;
    stop: () => Promise<void>;
    state: { seconds: number; transcript: string } | null;
    permission: 'granted' | 'ask' | 'denied';
    openSystemSettings: () => void;
  };
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
};

export function RecordApp(props: RecordAppProps) {
  const record = useRecord(props.store, props.bridge, undefined, props.audio);
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

  const inputRef = useRef<TextInputType>(null);
  const loadedAt = useRef(Date.now()).current;

  const [launchVisible, setLaunchVisible] = useState(props.coldStart);
  const [launchLeaving, setLaunchLeaving] = useState(false);
  /** Once per mount, whatever the prop does afterwards. */
  const launchPlayed = useRef(props.coldStart);
  const [micNotice, setMicNotice] = useState<'ask' | 'denied' | null>(null);

  /* ------------------------------------------------------------------- launch */

  const dismissLaunch = useCallback(() => {
    setLaunchLeaving((already) => {
      if (!already) return true;
      return already;
    });
  }, []);

  /**
   * The lockup waits for the fonts, so `coldStart` arrives false and turns true a moment
   * later — it is `coldStart && fontsReady`, and the record is drawn before either. Reading
   * it only as initial state meant the lockup never played at all on a real launch: by the
   * time it was true, nothing was looking. It is latched here instead, once per mount.
   */
  useEffect(() => {
    if (!props.coldStart || launchPlayed.current) return;
    launchPlayed.current = true;
    setLaunchVisible(true);
  }, [props.coldStart]);

  useEffect(() => {
    if (!launchVisible) return;
    // Counted from when the app was opened, not from when the lockup appeared: the point is
    // to bound how long it is until the record is there, not to add to it.
    const hold = launchHoldFor(loadedAt, Date.now(), reducedMotion);
    const id = setTimeout(dismissLaunch, hold);
    return () => clearTimeout(id);
  }, [launchVisible, loadedAt, reducedMotion, dismissLaunch]);

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
      if (state === 'active') void flush();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [props.store, props.bridge]);

  /* -------------------------------------------------------------------- voice */

  /**
   * Whether the circle is still under a finger.
   *
   * Starting is not instant — the session is configured, the engine is built, the file is
   * opened, and the very first time iOS raises two permission prompts in the middle of it.
   * A release that arrives before any of that finishes used to be spent on a recording that
   * had not begun, and the one that began a moment later had nothing left to end it: it
   * ran on until something else was pressed.
   */
  const holding = useRef(false);

  const startRecording = useCallback(async (handsFree = false) => {
    // A recording asked for by the widget has no finger behind it, so it is not "held" and
    // must not be ended for being let go of. It ends by pressing the circle.
    holding.current = !handsFree;
    // Holding the circle is not typing. The keyboard goes away so the recording has the
    // whole edge, which is what the veil and the level meter are drawn against.
    dismissKeyboard();
    if (props.voice.permission === 'denied') {
      setMicNotice('denied');
      // It clears itself. A permission notice that had to be dismissed would be a dialog.
      setTimeout(() => setMicNotice(null), 7000);
      return;
    }
    // `ask` is not a refusal, and it is the state every cold launch starts in. Holding the
    // circle IS the request: the native side raises both prompts on its first attempt, and
    // answering them is what turns `ask` into `granted` or `denied`. Stopping here instead
    // left voice unreachable for good — nothing else ever asks.
    if (props.voice.permission === 'ask') {
      setMicNotice('ask');
      setTimeout(() => setMicNotice(null), 7000);
    } else {
      setMicNotice(null);
    }
    await props.voice.start();
    // Let go while it was still opening: end it now, as if the release had waited. A
    // hands-free recording was never held, so this does not apply to it.
    if (!handsFree && !holding.current) await props.voice.stop();
  }, [props.voice]);

  /** The widget asked for listening. Once per arrival, and only once the surface is up. */
  useEffect(() => {
    if (!props.voiceOnOpen) return;
    props.onVoiceOnOpenHandled?.();
    const id = setTimeout(() => void startRecording(true), 320);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.voiceOnOpen]);

  const stopRecording = useCallback(async () => {
    holding.current = false;
    await props.voice.stop();
  }, [props.voice]);

  /* ------------------------------------------------------------------ notices */

  const notices: EdgeNotice[] = [];
  if (micNotice) {
    notices.push({
      kind: 'mic',
      text:
        micNotice === 'denied'
          ? 'chinotto can’t hear — the microphone is off for it in ios settings.'
          : 'ios will ask once whether chinotto may hear you.',
      // Nothing to offer while iOS is the one asking — the notice is saying what is about
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

  return (
    <View
      style={{ flex: 1, backgroundColor: SURFACE }}
      // The launch lockup is not modal, so the first touch anywhere ends it.
      onStartShouldSetResponderCapture={() => {
        if (launchVisible && !launchLeaving) dismissLaunch();
        return false;
      }}
    >
      <StatusBar barStyle="light-content" backgroundColor={SURFACE} />

      {/*
        Chinotto's own temporal orientation, and nothing else.

        The prototype draws a clock and a signal/battery glyph here because it is a browser
        mock of a phone. On a phone, iOS owns that row — drawing our own clock put two of
        them on screen at once. So this says only the thing iOS cannot: where in the record
        you are standing, and how to come back.
      */}
      {record.anchor ? (
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

      <RecordList
        keyboardInset={keyboardInset}
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
        onRemove={record.remove}
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
              onOpen={() => {
                record.setFocusId(record.ret!.material.id);
                record.closeReturn('opened');
              }}
              onContinue={() => {
                record.setFocusId(record.ret!.material.id);
                record.startContinue();
                record.closeReturn('continued');
              }}
              onHold={() => {
                // `let_go` is about the Return, not about the material: the Return has
                // been dismissed, and the holding of what it brought back is recorded in
                // `holds`, which is where holding lives. The outcome column has no `held`
                // and should not grow one — both facts are already written down, in the
                // two places that mean them.
                void record.toggleHold(record.ret!.material);
                record.closeReturn('let_go');
              }}
              onLetGo={record.letGo}
            />
          ) : null
        }
        renderFindEmpty={() => (
          <View style={{ gap: 16, marginBottom: 22 }}>
            <Text style={type({ size: 16, width: 90, lineHeight: 1.4, color: ink.far })}>
              nothing with those words. close in meaning, maybe:
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
                    {g.when}
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
      />

      <Edge
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
        onToggleMeaning={record.toggleMeaning}
        recording={props.voice.state}
        onStartRecording={() => void startRecording()}
        onStopRecording={stopRecording}
        notices={notices}
        keyboardInset={keyboardInset}
        onHeightChange={setEdgeHeight}
      />

      {record.focus ? (
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
          onRemove={record.remove}
          playingId={record.playingId}
          onPlay={(m) => void record.togglePlay(m)}
          traces={record.focusTraces}
          onOpenTrace={(m) => record.setFocusId(m.id)}
          onConfirmTrace={(m) => void record.judgeTrace(m, 'confirmed')}
          onRejectTrace={(m) => void record.judgeTrace(m, 'rejected')}
          continuing={record.continuing}
          continueText={record.continueText}
          onChangeContinueText={record.setContinueText}
          onStartContinue={record.startContinue}
          onSubmitContinue={record.submitContinue}
          onClose={() => {
            record.setFocusId(null);
            record.stopContinue();
            record.cancelCorrection();
          }}
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
          onFinished={() => setLaunchVisible(false)}
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
          // At rest the strip is a handle, not an announcement: it sits at the quietest ink
          // the record has. Under the finger it comes up to the weight of everything else.
          opacity: pulling ? Math.min(1, pull / 40) : 1,
        }}
        pointerEvents="none"
      >
        <Mark size={pulling ? 22 : 16} color={pulling ? ink.meta : ink.faint} />
        {pulling || hint ? (
          <Text
            style={type({ size: 14, width: 90, color: pulling ? ink.meta : ink.faint })}
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
