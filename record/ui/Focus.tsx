/**
 * Focus: one moment, or the Line it belongs to, pushed in from the right.
 *
 * A Line is read oldest first, down a rail, with the moment you came from marked. Over five
 * moments it folds in the middle — two at each end — and the fold says which span it is
 * hiding rather than just that something is missing.
 *
 * Two things here are load-bearing and easy to get wrong:
 *
 *   * **Correcting** happens in place, and says what it will and will not do: *wording only ·
 *     date and earlier wording stay*. It is not a rename and not an edit of history.
 *   * **Continue** opens a field for a new moment *dated now*. It never edits the moment
 *     above it. The placeholder says so.
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Marked } from './Marked';
import { useKeyboardInset } from './useKeyboardInset';
import { VoiceChip, type VoiceChipSpec } from './VoiceChip';
import { ink, motion, rule, SURFACE } from './tokens';
import { face, type } from './type';
import { foldLine, lineHeading, type LineEntry } from '../model/lines';
import {
  displayText,
  isQuoteOnly,
  isVoice,
  sourceOf,
  type Material,
} from '../model/material';
import { dayLabel, fmtDur, fullDate, fmtTime, monthLabel } from '../model/time';
import { parts, snippet } from '../model/words';
import { tracesHeading, type Trace } from '../model/traces';

export type FocusProps = {
  focus: Material;
  line: Material[];
  now: number;
  unfolded: boolean;
  onUnfold: () => void;

  selectedId: string | null;
  onSelect: (id: string | null) => void;

  editingId: string | null;
  editText: string;
  onChangeEditText: (text: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onCorrect: (m: Material) => void;

  shownPrevious: Record<string, boolean>;
  onTogglePrevious: (id: string) => void;

  heldIds: Set<string>;
  onHold: (m: Material) => void;
  onRemove: (m: Material) => void;

  playingId: string | null;
  onPlay: (m: Material) => void;

  traces: Trace[];
  onOpenTrace: (m: Material) => void;
  onConfirmTrace: (m: Material) => void;
  onRejectTrace: (m: Material) => void;

  continuing: boolean;
  continueText: string;
  onChangeContinueText: (text: string) => void;
  onStartContinue: () => void;
  onSubmitContinue: () => void;

  onClose: () => void;
};

/** The line's own chip: a shade tighter than the record's, matching the type around it. */
const FOCUS_CHIP: VoiceChipSpec = {
  fontSize: 12,
  paddingTop: 2,
  paddingBottom: 2,
  paddingLeft: 5,
  paddingRight: 7,
  marginRight: 6,
};

export function Focus(props: FocusProps) {
  const slide = useRef(new Animated.Value(0)).current;
  // Continue and correction sit on the keyboard for the same reason the edge does: they are
  // the bottom of this surface, not something floating over it.
  const keyboardInset = useKeyboardInset();
  useEffect(() => {
    Animated.timing(slide, {
      toValue: 1,
      duration: motion.pushIn,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [slide]);

  const isLine = props.line.length > 1;
  const entries = foldLine(props.line, props.now, props.unfolded);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: SURFACE,
        zIndex: 4,
        opacity: slide,
        transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
      }}
    >
      <View style={{ height: 54 }} />
      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 12,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Pressable onPress={props.onClose} accessibilityRole="button" hitSlop={12}>
          <Text style={type({ size: 14, width: 90, color: ink.far })}>‹ edge</Text>
        </Pressable>
        <Text style={type({ size: 12, width: 90, color: ink.meta })}>
          {lineHeading(props.line, props.focus, props.now)}
        </Text>
      </View>

      <Animated.ScrollView
        style={{ flex: 1, marginBottom: keyboardInset }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 26, paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={{ position: 'relative', paddingLeft: 18, gap: 22 }}>
          {isLine ? (
            <View
              style={{
                position: 'absolute',
                left: 3,
                top: 8,
                bottom: 8,
                width: 2,
                backgroundColor: rule.line,
              }}
            />
          ) : null}

          {entries.map((entry) =>
            entry.kind === 'fold' ? (
              <View key="fold" style={{ position: 'relative' }}>
                <View
                  style={{
                    position: 'absolute',
                    left: -16,
                    top: 6,
                    width: 4,
                    height: 4,
                    backgroundColor: ink.meta,
                  }}
                />
                <Text style={type({ size: 12, width: 90, color: ink.meta })}>
                  {`${entry.label} · `}
                  <Text onPress={props.onUnfold} style={{ color: ink.verb }}>
                    unfold
                  </Text>
                </Text>
              </View>
            ) : (
              <Moment key={entry.material.id} entry={entry} {...props} />
            )
          )}
        </View>

        {props.traces.length ? (
          <View
            style={{
              marginTop: 28,
              paddingTop: 16,
              borderTopWidth: 1,
              borderTopColor: rule.hair,
              gap: 12,
            }}
          >
            <Text
              style={{
                fontFamily: face(90),
                fontSize: 10,
                color: ink.meta,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
              }}
            >
              {tracesHeading(props.traces)}
            </Text>
            {props.traces.slice(0, 4).map((t) => (
              <TraceRow
                key={t.material.id}
                trace={t}
                now={props.now}
                onOpen={() => props.onOpenTrace(t.material)}
                onYes={() => props.onConfirmTrace(t.material)}
                onNo={() => props.onRejectTrace(t.material)}
              />
            ))}
          </View>
        ) : null}
      </Animated.ScrollView>

      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: keyboardInset,
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: 44,
          backgroundColor: SURFACE,
        }}
      >
        {props.continuing ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
            <TextInput
              accessibilityLabel="a new moment, dated now"
              autoFocus
              // Chinotto keeps the casing somebody chose. `dinner friday` is how they wrote
              // it, and iOS turning it into `Dinner friday` is the product overruling them
              // about their own words. Autocorrection stays — only the capitalising goes.
              autoCapitalize="none"
              multiline
              value={props.continueText}
              onChangeText={props.onChangeContinueText}
              onSubmitEditing={props.onSubmitContinue}
              blurOnSubmit={false}
              submitBehavior="submit"
              // The placeholder is the promise: a NEW moment, with its own date. Nothing
              // above it is touched.
              placeholder="a new moment, dated now"
              placeholderTextColor={ink.placeholder}
              selectionColor={ink.ink}
              style={[
                type({ size: 20, width: 100, lineHeight: 1.3 }),
                { flex: 1, color: ink.ink, paddingVertical: 12, maxHeight: 180 },
              ]}
            />
            <Pressable
              onPress={props.onSubmitContinue}
              accessibilityRole="button"
              accessibilityLabel="leave it"
              style={{
                width: 48,
                height: 48,
                backgroundColor: ink.ink,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 6,
              }}
            >
              <Text style={{ fontFamily: face(100), fontSize: 20, color: SURFACE }}>↑</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={props.onStartContinue}
              accessibilityRole="button"
              style={{
                flex: 1,
                height: 56,
                backgroundColor: ink.ink,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontFamily: face(92), fontSize: 17, color: SURFACE }}>continue</Text>
            </Pressable>
            <Pressable
              onPress={() => props.onHold(props.focus)}
              accessibilityRole="button"
              style={{
                height: 56,
                paddingHorizontal: 22,
                borderWidth: 1,
                borderColor: ink.faint,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontFamily: face(92), fontSize: 16, color: ink.ink }}>
                {props.heldIds.has(props.focus.id) ? 'release' : 'hold'}
              </Text>
            </Pressable>
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

function Moment({
  entry,
  ...props
}: FocusProps & { entry: Extract<LineEntry, { kind: 'moment' }> }) {
  const m = entry.material;
  const isFocus = m.id === props.focus.id;
  const voice = isVoice(m);
  const editing = props.editingId === m.id;
  const selected = props.selectedId === m.id;

  const body = displayText(m);
  const paragraphs = body.split(/\n\n+/);
  const when = dayLabel(m.at, props.now) === 'today' ? 'today' : fullDate(m.at);

  return (
    <View style={{ position: 'relative' }}>
      <View
        style={{
          position: 'absolute',
          left: -18,
          top: 6,
          width: 8,
          height: 8,
          backgroundColor: isFocus ? ink.ink : ink.meta,
        }}
      />

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 4 }}>
        <Text style={type({ size: 12, width: 90, color: ink.meta })}>
          {`${when} · ${fmtTime(m.at)} · ${sourceOf(m)}`}
        </Text>
        {m.correctionCount > 0 ? (
          <Text
            onPress={() => props.onTogglePrevious(m.id)}
            style={type({ size: 12, width: 90, color: ink.faint })}
          >
            {`corrected · ${props.shownPrevious[m.id] ? 'hide' : 'show'}`}
          </Text>
        ) : null}
      </View>

      {editing ? (
        <>
          <TextInput
            accessibilityLabel="correct the wording"
            autoFocus
            autoCapitalize="none"
            multiline
            value={props.editText}
            onChangeText={props.onChangeEditText}
            onSubmitEditing={props.onSaveEdit}
            blurOnSubmit={false}
            submitBehavior="submit"
            selectionColor={ink.ink}
            style={[
              type({ size: 20, width: 100, lineHeight: 1.3 }),
              {
                color: ink.ink,
                borderBottomWidth: 2,
                borderBottomColor: ink.meta,
                paddingBottom: 4,
              },
            ]}
          />
          <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
            {/* The sentence states the contract of a correction, before you commit to it. */}
            <Text style={type({ size: 12, width: 90, color: ink.meta })}>
              wording only · date and earlier wording stay
            </Text>
            <Text
              onPress={props.onSaveEdit}
              style={[type({ size: 12, width: 90, color: ink.ink }), { marginLeft: 'auto' }]}
            >
              save
            </Text>
            <Text
              onPress={props.onCancelEdit}
              style={type({ size: 12, width: 90, color: ink.meta })}
            >
              cancel
            </Text>
          </View>
        </>
      ) : (
        <>
          {isQuoteOnly(m) ? (
            <Text
              style={[
                type({ size: 15, width: 100, lineHeight: 1.35, color: ink.far }),
                {
                  paddingLeft: 12,
                  borderLeftWidth: 2,
                  borderLeftColor: rule.line,
                  marginBottom: 8,
                },
              ]}
            >
              {`“${m.selectedText}”`}
            </Text>
          ) : null}

          <Pressable onPress={() => props.onSelect(selected ? null : m.id)}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              {voice ? (
                <VoiceChip
                  seconds={Math.round((m.durationMs ?? 0) / 1000)}
                  missing={Boolean(m.audioMissing)}
                  playing={props.playingId === m.id}
                  spec={FOCUS_CHIP}
                  onPlay={() => props.onPlay(m)}
                />
              ) : null}
              <View style={{ flex: 1 }}>
                <Marked
                  parts={parts(paragraphs[0], [])}
                  style={
                    isFocus
                      ? type({
                          size: 20,
                          width: 100,
                          lineHeight: 1.3,
                          tracking: -0.01,
                          italic: voice,
                          color: voice ? ink.far : ink.ink,
                        })
                      : type({
                          size: 16,
                          width: 94,
                          lineHeight: 1.32,
                          italic: voice,
                          color: voice ? ink.far : ink.near,
                        })
                  }
                />
                {paragraphs.slice(1).map((p, i) => (
                  <Text
                    key={i}
                    style={[
                      isFocus
                        ? type({ size: 20, width: 100, lineHeight: 1.3, color: ink.ink })
                        : type({ size: 16, width: 94, lineHeight: 1.32, color: ink.near }),
                      { marginTop: 10 },
                    ]}
                  >
                    {p}
                  </Text>
                ))}
              </View>
            </View>
          </Pressable>

          {m.url ? (
            <Text style={[type({ size: 12, width: 90, color: ink.meta }), { marginTop: 4 }]}>
              {m.title ? `${m.domain ?? ''} · ${m.title}` : (m.domain ?? m.url)}
            </Text>
          ) : null}

          {props.shownPrevious[m.id] && m.previousBody ? (
            <Text
              style={[
                type({ size: 14, width: 90, lineHeight: 1.35, italic: true, color: ink.meta }),
                { marginTop: 8 },
              ]}
            >
              {`earlier wording · ${m.previousBody}`}
            </Text>
          ) : null}

          {selected ? (
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
              <Text
                onPress={() => props.onCorrect(m)}
                style={type({ size: 14, width: 92, color: ink.verb })}
              >
                correct
              </Text>
              <Text
                onPress={() => props.onHold(m)}
                style={type({ size: 14, width: 92, color: ink.verb })}
              >
                {props.heldIds.has(m.id) ? 'release' : 'hold'}
              </Text>
              <Text
                onPress={() => props.onRemove(m)}
                style={type({ size: 14, width: 92, color: ink.meta })}
              >
                remove
              </Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

/**
 * A trace row.
 *
 * `same words` is upright and shows the shared run in context. `a guess` is italic, says it
 * is a guess, and offers `yes · not this` — the two answers are the only way an inference
 * ever becomes a fact here.
 */
function TraceRow({
  trace,
  now,
  onOpen,
  onYes,
  onNo,
}: {
  trace: Trace;
  now: number;
  onOpen: () => void;
  onYes: () => void;
  onNo: () => void;
}) {
  const guess = trace.kind === 'guess';
  const kindLabel = guess ? 'a guess' : trace.kind === 'same_source' ? 'same source' : 'same words';
  const when =
    now - trace.material.at < 7 * 864e5
      ? dayLabel(trace.material.at, now)
      : monthLabel(trace.material.at, now);

  const text = trace.phrase
    ? snippet(displayText(trace.material).replace(/\n+/g, ' '), trace.phrase)
    : displayText(trace.material).split('\n')[0].slice(0, 90);

  return (
    <View>
      <Text style={type({ size: 14, width: 90, color: ink.meta })}>{`${kindLabel} · ${when}`}</Text>
      <Marked
        parts={parts(text, trace.phrase ? [trace.phrase] : [])}
        quiet
        onPress={onOpen}
        style={type({
          size: 14,
          width: 90,
          lineHeight: 1.35,
          italic: guess,
          color: guess ? ink.dim : ink.far,
        })}
      />
      {guess ? (
        <Text style={[type({ size: 14, width: 90, color: ink.meta }), { marginTop: 2 }]}>
          <Text onPress={onYes} style={{ color: ink.verb }}>
            yes
          </Text>
          {' · '}
          <Text onPress={onNo} style={{ color: ink.verb }}>
            not this
          </Text>
        </Text>
      ) : null}
    </View>
  );
}
