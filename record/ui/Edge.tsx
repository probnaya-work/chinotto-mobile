/**
 * The edge: where capture happens, and the only permanently present part of the app.
 *
 * Three states share one row, because they are one thing:
 *
 *   * **idle** — a 3pt caret standing in for the field, and the hold-to-speak circle.
 *   * **typing** — the field, and a send button where the circle was.
 *   * **speaking** — the record recedes behind a veil, the live transcript and the elapsed
 *     time come up, and the circle grows and inverts.
 *
 * Above them, the quiet notices stack: microphone, undo, sync, update. None of them is a
 * dialog, none of them blocks, and none of them survives being ignored.
 *
 * The capture field is cleared **before** anything else happens on submit, which is the one
 * ordering rule the prototype states outright: capture cannot fail, so it must not appear to
 * wait for anything.
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { edge, ink, motion, RECORDING_BAR_SECONDS, SURFACE } from './tokens';
import { face, type } from './type';
import { fmtDur } from '../model/time';

/** The field's own breathing room, above and below the words. */
const FIELD_PADDING_Y = 14;

export type EdgeNotice =
  | { kind: 'mic'; text: string; action?: string; onAction?: () => void }
  | { kind: 'held'; text: string }
  | { kind: 'undo'; text: string; secondsLeft: number; onUndo: () => void }
  | { kind: 'sync'; text: string; urgent: boolean; onOpen: () => void }
  | { kind: 'update'; onUpdate: () => void; onLater: () => void };

export type EdgeProps = {
  input: string;
  onChangeInput: (text: string) => void;
  onSubmit: () => void;
  inputRef?: React.RefObject<TextInput | null>;

  /** True while the field has focus; the caret hides when it does. */
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onPressCaret: () => void;

  /** Standing somewhere: the field is replaced by the way back. */
  anchored: boolean;
  onClearAnchor: () => void;

  /** Find: `12 · in words`, with the reading it is doing. */
  findSummary: string | null;
  onToggleMeaning: () => void;

  recording: { seconds: number; transcript: string } | null;
  onStartRecording: () => void;
  onStopRecording: () => void;

  notices: EdgeNotice[];

  /**
   * How far the keyboard has raised the bottom of the usable surface.
   *
   * The edge sits on top of it rather than behind it. This is the same edge either way —
   * it has simply been given a different floor.
   */
  keyboardInset: Animated.Value;
};

export function Edge(props: EdgeProps) {
  const recording = props.recording !== null;
  const showCaret = !props.input && !props.focused && !props.anchored && !recording;
  const showSend = Boolean(props.input) && !props.input.startsWith('/') && !props.anchored;
  const showMic = !props.input && !props.anchored;

  return (
    <>
      {recording ? <SpeakingVeil recording={props.recording!} /> : null}

      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: props.keyboardInset,
          paddingTop: edge.paddingTop,
          // The home-indicator gutter is the keyboard's job once the keyboard is there, so
          // the edge stops reserving it and sits directly on the keyboard instead.
          paddingBottom: props.keyboardInset.interpolate({
            inputRange: [0, 1],
            outputRange: [edge.paddingBottom, edge.paddingBottom - 1],
            extrapolate: 'clamp',
          }),
          paddingHorizontal: 24,
          backgroundColor: SURFACE,
          zIndex: 2,
        }}
      >
        {props.notices.length && !recording && !props.anchored ? (
          <View style={{ gap: 8, marginBottom: 10 }}>
            {props.notices.map((n) => (
              <Notice key={n.kind} notice={n} />
            ))}
          </View>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 14,
            minHeight: edge.minHeight,
          }}
        >
          {recording ? (
            <View style={{ flex: 1 }} />
          ) : props.anchored ? (
            <Text
              onPress={props.onClearAnchor}
              style={[
                type({ size: 14, width: 90, color: ink.meta }),
                { flex: 1, paddingVertical: 22 },
              ]}
            >
              ▲ back to the edge
            </Text>
          ) : (
            <>
              {showCaret ? (
                <Pressable
                  onPress={props.onPressCaret}
                  hitSlop={12}
                  accessibilityRole="button"
                  // A 3pt line is the whole affordance, and it had no name at all.
                  accessibilityLabel="start typing"
                >
                  <View
                    style={{
                      width: edge.caretWidth,
                      height: edge.caretHeight,
                      backgroundColor: ink.ink,
                      marginBottom: 17,
                    }}
                  />
                </Pressable>
              ) : null}

              <CaptureField
                value={props.input}
                onChangeText={props.onChangeInput}
                onSubmitEditing={props.onSubmit}
                onFocus={props.onFocus}
                onBlur={props.onBlur}
                ref={props.inputRef}
              />

              {props.findSummary ? (
                // The reading is a verb, not a label — pressing it changes what Find does —
                // so the whole summary is the target rather than two words of 12pt type.
                <Pressable
                  onPress={props.onToggleMeaning}
                  accessibilityRole="button"
                  accessibilityLabel={`${props.findSummary} · change the reading`}
                  hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
                  style={{ paddingBottom: 22 }}
                >
                  <Text style={type({ size: 12, width: 90, color: ink.meta })} numberOfLines={1}>
                    {props.findSummary.split(' · ')[0]}
                    {' · '}
                    <Text style={{ color: ink.verb }}>
                      {props.findSummary.split(' · ')[1]}
                    </Text>
                  </Text>
                </Pressable>
              ) : null}

              {showSend ? (
                <Pressable
                  onPress={props.onSubmit}
                  accessibilityRole="button"
                  accessibilityLabel="leave it"
                  style={{
                    width: edge.sendSize,
                    height: edge.sendSize,
                    backgroundColor: ink.ink,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ fontFamily: face(100), fontSize: 20, color: SURFACE }}>↑</Text>
                </Pressable>
              ) : null}
            </>
          )}

          {/*
            One circle, across both states, and never swapped for another one.
            "Hold to speak, release to leave it" is a single touch: pressing it starts the
            recording, which is also what changes how it looks. Drawing the speaking state
            as a *different* Pressable unmounted the element the finger was on, so the
            release landed on nothing and the recording ran on after the hand was gone. A
            tap on the new circle stopped it, which is how it looked like it worked.
          */}
          {showMic || recording ? (
            <Pressable
              onPressIn={recording ? undefined : props.onStartRecording}
              onPressOut={props.onStopRecording}
              accessibilityRole="button"
              accessibilityLabel={recording ? 'stop recording' : 'hold to speak'}
              style={
                recording
                  ? {
                      width: edge.micRecordingSize,
                      height: edge.micRecordingSize,
                      borderRadius: edge.micRecordingSize / 2,
                      backgroundColor: ink.ink,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }
                  : {
                      width: edge.micSize,
                      height: edge.micSize,
                      borderRadius: edge.micSize / 2,
                      borderWidth: 1.5,
                      borderColor: ink.ink,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 4,
                    }
              }
            >
              <View
                style={
                  recording
                    ? { width: 14, height: 14, borderRadius: 7, backgroundColor: SURFACE }
                    : { width: 12, height: 12, borderRadius: 6, backgroundColor: ink.ink }
                }
              />
            </Pressable>
          ) : null}
        </View>
      </Animated.View>
    </>
  );
}

/**
 * One line high when it is empty, and the size of its words otherwise.
 *
 * Growth is left to the platform, which measures the text properly and scrolls inside the
 * cap once there is more than fits. Emptiness is not: iOS keeps a multiline field at the
 * height it grew to when its value is cleared while it still has focus, so after a capture
 * the edge stayed eight lines tall over an empty field — opaque, at zIndex 2, sitting on top
 * of the very moment it had just taken. It only collapsed when the field lost focus.
 *
 * So the one case the platform gets wrong is the one case stated outright, and the rest is
 * left alone.
 */
const FIELD_ONE_LINE = Math.round(edge.fieldSize * 1.3) + FIELD_PADDING_Y * 2;

const CaptureField = React.forwardRef<TextInput, TextInputProps>(function CaptureField(
  { value, style, ...rest },
  ref
) {
  return (
    <TextInput
      ref={ref}
      accessibilityLabel="capture"
      multiline
      // `blurOnSubmit` with `multiline` is what turns Return into submit rather than a
      // newline. A newline is still reachable from the keyboard's own key.
      blurOnSubmit={false}
      returnKeyType="done"
      submitBehavior="submit"
      spellCheck={false}
      // Autocorrection stays — it is useful. Capitalisation does not: Chinotto keeps the
      // casing somebody chose, and `dinner friday` becoming `Dinner friday` is the product
      // overruling them about their own words.
      autoCorrect
      autoCapitalize="none"
      selectionColor={ink.ink}
      value={value}
      style={[
        type({ size: edge.fieldSize, width: 100, lineHeight: 1.3, tracking: -0.01 }),
        {
          flex: 1,
          color: ink.ink,
          paddingVertical: FIELD_PADDING_Y,
          maxHeight: edge.fieldMaxHeight,
        },
        value ? null : { height: FIELD_ONE_LINE },
        style,
      ]}
      {...rest}
    />
  );
});

/** What is being said, over a veil so the record behind it never collides with the words. */
function SpeakingVeil({ recording }: { recording: { seconds: number; transcript: string } }) {
  return (
    <>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 54,
          bottom: 0,
          backgroundColor: SURFACE,
          opacity: 0.86,
          zIndex: 1,
        }}
        pointerEvents="none"
      />
      <View
        style={{
          position: 'absolute',
          left: 24,
          right: 24,
          bottom: 130,
          gap: 16,
          zIndex: 2,
        }}
        pointerEvents="none"
      >
        <Text
          style={[
            type({ size: 22, width: 100, lineHeight: 1.3, italic: true, color: ink.far }),
            { minHeight: 30 },
          ]}
        >
          {recording.transcript}
          <Text style={{ color: ink.faint }}> …</Text>
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <SpeakingBars />
          <Text style={type({ size: 34, width: 100, tracking: -0.02, color: ink.ink })}>
            {fmtDur(recording.seconds)}
          </Text>
          <Text
            style={[type({ size: 12, width: 90, color: ink.meta }), { marginLeft: 'auto' }]}
          >
            release to leave it
          </Text>
        </View>
      </View>
    </>
  );
}

/**
 * Four bars at the prototype's four durations.
 *
 * Under reduced motion they are held at full height rather than frozen mid-scale — a row of
 * stubs would read as a broken meter rather than as a still one.
 */
function SpeakingBars() {
  const values = useRef(RECORDING_BAR_SECONDS.map(() => new Animated.Value(1))).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const loops = values.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: 0.4,
            duration: (RECORDING_BAR_SECONDS[i] * 1000) / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 1,
            duration: (RECORDING_BAR_SECONDS[i] * 1000) / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [values, reduced]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 36 }}>
      {values.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: 3,
            height: 36,
            backgroundColor: ink.ink,
            transform: [{ scaleY: v }],
          }}
        />
      ))}
    </View>
  );
}

function Notice({ notice }: { notice: EdgeNotice }) {
  const base = type({ size: 13, width: 90, lineHeight: 1.4, color: ink.far });
  switch (notice.kind) {
    case 'mic':
      return (
        <Text style={base}>
          {notice.text}
          {notice.action ? (
            <>
              {' '}
              <Text onPress={notice.onAction} style={{ color: ink.ink }}>
                {notice.action}
              </Text>
            </>
          ) : null}
        </Text>
      );
    case 'undo':
      return (
        <Text style={[base, { color: ink.verb }]}>
          {`removed “${notice.text}” · `}
          <Text onPress={notice.onUndo} style={{ color: ink.ink }}>
            bring back
          </Text>
          {` · ${notice.secondsLeft}s`}
        </Text>
      );
    case 'held':
      // Nothing to press. The shelf is full and letting something go is the answer, which
      // is done where the held things are, not here.
      return <Text style={[base, { color: ink.far }]}>{notice.text}</Text>;
    case 'sync':
      return (
        <Text
          onPress={notice.onOpen}
          style={[base, { color: notice.urgent ? ink.ink : ink.far }]}
        >
          {notice.text}
        </Text>
      );
    case 'update':
      return (
        <Text style={[base, { color: ink.meta }]}>
          {'chinotto 2.0.1 is in the app store · '}
          <Text onPress={notice.onUpdate} style={{ color: ink.verb }}>
            update
          </Text>
          {' · '}
          <Text onPress={notice.onLater}>later</Text>
        </Text>
      );
  }
}

/** Kept local so `Edge` has no dependency beyond React Native itself. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AccessibilityInfo } = require('react-native') as typeof import('react-native');
    AccessibilityInfo.isReduceMotionEnabled?.().then((v: boolean) => {
      if (alive) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduced;
}

export { useReducedMotion };
export const EDGE_MOTION = motion;
