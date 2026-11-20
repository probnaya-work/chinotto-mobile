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

import { useRecordTheme } from './appearance';
import React, { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { Marked } from './Marked';
import { ReturnContext } from './ReturnBlock';
import { ConnectionPanel, type ConnectionData } from './ConnectionPanel';
import { useKeyboardInset } from './useKeyboardInset';
import { VoiceChip, type VoiceChipSpec } from './VoiceChip';
import { motion } from './tokens';
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
import type { Trace } from '../model/traces';
import type { RecordReturn } from '../model/returns';

export type QuietScrollPosition = { normal: number; quiet: number; restore: number | null };

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
  connections?: ConnectionData;

  continuing: boolean;
  continueText: string;
  onChangeContinueText: (text: string) => void;
  onStartContinue: () => void;
  onSubmitContinue: () => void;

  reminder?: { label: string; onOpen: () => void; notice: string | null };
  fromReminder?: boolean;
  positionAtMoment?: boolean;
  returnContext?: RecordReturn | null;
  reducedMotion?: boolean;
  quietReading: boolean;
  quietPosition: React.RefObject<QuietScrollPosition>;
  onEnterQuietReading: (offset: number) => void;
  onExitQuietReading: () => void;
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
  const { ink, agency, rule, SURFACE, LIVE, mode } = useRecordTheme();
  const { quietReading, quietPosition } = props;

  const slide = useRef(new Animated.Value(props.reducedMotion ? 1 : 0)).current;
  const scroll = useRef<ScrollView>(null);
  const initialOffset = useRef({ x: 0, y: quietReading ? quietPosition.current.quiet : 0 });
  const offset = useRef(initialOffset.current.y);
  const positioned = useRef<string | null>(null);
  const momentOffset = useRef<{ id: string; y: number } | null>(null);
  // Continue and correction sit on the keyboard for the same reason the edge does: they are
  // the bottom of this surface, not something floating over it.
  const keyboardInset = useKeyboardInset();
  useEffect(() => {
    if (props.reducedMotion) {
      slide.setValue(1);
      return;
    }
    const animation = Animated.timing(slide, {
      toValue: 1,
      duration: motion.pushIn,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [slide, props.reducedMotion]);

  const trackScroll = useCallback(({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = Math.max(0, nativeEvent.contentOffset.y);
    if (quietReading) quietPosition.current.quiet = offset.current;
  }, [quietReading, quietPosition]);

  const restoreReaderPosition = useCallback(() => {
    const y = quietPosition.current.restore;
    if (quietReading || y === null || !scroll.current) return;
    quietPosition.current.restore = null;
    offset.current = y;
    scroll.current.scrollTo({ y, animated: false });
  }, [quietReading, quietPosition]);

  // Content-size changes handle the normal relayout. A frame also covers exits whose
  // content happens to be the same height in both modes.
  useEffect(() => {
    if (quietReading || quietPosition.current.restore === null) return;
    const frameId = requestAnimationFrame(restoreReaderPosition);
    return () => cancelAnimationFrame(frameId);
  }, [quietReading, quietPosition, restoreReaderPosition]);

  const isLine = props.line.length > 1;
  const id = props.focus.id;
  const entries = foldLine(props.line, props.now, props.unfolded, id);
  const positionAtMoment = props.positionAtMoment;
  const measureMoment = useCallback(({ nativeEvent }: LayoutChangeEvent) => {
    const y = nativeEvent.layout.y;
    momentOffset.current = { id, y };
    if (!positionAtMoment || positioned.current === id || !scroll.current) return;
    positioned.current = id;
    if (quietReading || quietPosition.current.restore !== null) return;
    // The offset is inside the Line, so scrolling there leaves the normal top inset.
    scroll.current.scrollTo({ y, animated: false });
  }, [id, positionAtMoment, quietReading, quietPosition]);
  const canCompare = props.connections && !props.continuing && !props.editingId && props.focus.body.trim();

  return (
    <Animated.View
      accessibilityViewIsModal={quietReading}
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
        <Pressable onPress={quietReading ? props.onExitQuietReading : props.onClose}
          accessibilityRole="button" hitSlop={quietReading ? undefined : 12}
          style={({ pressed }) => quietReading ? {
            minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.7 : 1,
          } : undefined}>
          {quietReading ? (
            <View pointerEvents="none" style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: LIVE }} />
          ) : null}
          <Text style={type({ size: 14, width: 90, color: ink.far })}>{quietReading ? 'exit quiet reading' : '‹ edge'}</Text>
        </Pressable>
        <Text style={[type({ size: 12, width: 90, color: ink.meta }),
          quietReading ? { flexShrink: 1, marginLeft: 10, textAlign: 'right' } : undefined]}>
          {lineHeading(props.line, props.focus, props.now)}
        </Text>
      </View>

      <Animated.ScrollView
        ref={scroll}
        testID="thought-reader"
        contentOffset={initialOffset.current}
        onScroll={trackScroll}
        scrollEventThrottle={32}
        onContentSizeChange={restoreReaderPosition}
        style={{ flex: 1, marginBottom: keyboardInset }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 26, paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {props.fromReminder && !quietReading ? (
          <Text style={[type({ size: 12, width: 90, color: ink.meta }), { marginBottom: 16 }]}>
            a reminder you set
          </Text>
        ) : null}
        <View style={{ position: 'relative', paddingLeft: 18, gap: quietReading ? 28 : 22 }}>
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
              <Pressable
                key={`fold:${entry.firstId}`}
                accessibilityRole="button"
                accessibilityLabel={`${entry.label} · unfold`}
                onPress={props.onUnfold}
                style={({ pressed }) => ({
                  position: 'relative', minHeight: 48, justifyContent: 'center', opacity: pressed ? 0.7 : 1,
                })}
              >
                <View
                  style={{
                    position: 'absolute',
                    left: -16,
                    top: 22,
                    width: 4,
                    height: 4,
                    backgroundColor: ink.meta,
                  }}
                />
                <Text style={type({ size: 12, width: 90, color: ink.meta })}>
                  {`${entry.label} · `}
                  <Text style={{ color: agency.ink, fontFamily: face(90, { weight: agency.weight }) }}>
                    unfold
                  </Text>
                </Text>
              </Pressable>
            ) : (
              <Moment
                key={entry.material.id}
                entry={entry}
                onLayout={entry.material.id === id ? measureMoment : undefined}
                onQuiet={() => props.onEnterQuietReading(offset.current)}
                {...props}
              />
            )
          )}
        </View>

        {!quietReading && (props.traces.length || canCompare) ? (
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
              traces
            </Text>
            {props.traces.slice(0, 4).map((t) => (
              <TraceRow
                key={t.material.id}
                trace={t}
                now={props.now}
                onOpen={() => props.onOpenTrace(t.material)}
              />
            ))}
            {canCompare && props.connections ? (
              <ConnectionPanel key={id} source={props.focus} data={props.connections}
                onReadSource={() => {
                  if (momentOffset.current?.id === id) {
                    scroll.current?.scrollTo({ y: momentOffset.current.y, animated: false });
                  }
                }} />
            ) : null}
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
              keyboardAppearance={mode}
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
                minHeight: 48,
                paddingVertical: 10,
                backgroundColor: agency.ink,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 6,
              }}
            >
              <Text style={{ fontFamily: face(100), fontSize: 20, color: agency.ground }}>↑</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <Text style={type({ size: 12, width: 90, color: ink.meta })}>continue · a new moment, dated now</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={props.onStartContinue}
                accessibilityRole="button"
                style={{
                  flex: 1,
                  minHeight: 56,
                  paddingVertical: 10,
                  backgroundColor: agency.ink,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontFamily: face(92, { weight: agency.weight }),
                    fontSize: 17,
                    color: agency.ground,
                  }}
                >
                  continue
                </Text>
              </Pressable>
              {!quietReading ? <Pressable
                onPress={() => props.onHold(props.focus)}
                accessibilityRole="button"
                style={{
                  minHeight: 56,
                  paddingVertical: 10,
                  paddingHorizontal: 22,
                  borderWidth: 1,
                  borderColor: ink.faint,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontFamily: face(92, { weight: agency.weight }),
                    fontSize: 16,
                    color: agency.ink,
                  }}
                >
                  {props.heldIds.has(props.focus.id) ? 'release' : 'hold'}
                </Text>
              </Pressable> : null}
            </View>
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

function Moment({
  entry,
  onLayout,
  onQuiet,
  ...props
}: FocusProps & {
  entry: Extract<LineEntry, { kind: 'moment' }>;
  onLayout?: (event: LayoutChangeEvent) => void;
  onQuiet: () => void;
}) {
  const { ink, agency, rule, mode } = useRecordTheme();

  const m = entry.material;
  const isFocus = m.id === props.focus.id;
  const voice = isVoice(m);
  const editing = props.editingId === m.id;
  const quietReading = props.quietReading;
  const selected = !quietReading && props.selectedId === m.id;

  const body = displayText(m);
  const paragraphs = body.split(/\n\n+/);
  const when = dayLabel(m.at, props.now) === 'today' ? 'today' : fullDate(m.at);
  const returnContext = isFocus && !quietReading ? props.returnContext : null;
  const match = returnContext?.phraseOld ?? null;
  const showQuietAction = Boolean(body.trim() || isQuoteOnly(m) || props.line.length > 1);
  const lineHeight = quietReading ? 1.47 : isFocus ? 1.3 : 1.32;

  return (
    <View onLayout={onLayout} style={{ position: 'relative' }}>
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

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 }}>
        <Text style={type({ size: 12, width: 90, color: ink.meta })}>
          {`${when} · ${fmtTime(m.at)} · ${sourceOf(m)}`}
        </Text>
        {m.correctionCount > 0 && !quietReading ? (
          <Text
            onPress={() => props.onTogglePrevious(m.id)}
            style={type({ size: 12, width: 90, color: ink.meta })}
          >
            {`corrected · ${props.shownPrevious[m.id] ? 'hide' : 'show'}`}
          </Text>
        ) : null}
      </View>

      {editing ? (
        <>
          <TextInput
            keyboardAppearance={mode}
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
              style={[
                type({ size: 12, width: 90, color: agency.ink, weight: agency.weight }),
                { marginLeft: 'auto' },
              ]}
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

          <Pressable accessible={quietReading ? false : undefined}
            onPress={quietReading ? undefined : () => props.onSelect(selected ? null : m.id)}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              {voice && !quietReading ? (
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
                  parts={parts(paragraphs[0], [match])}
                  style={
                    isFocus
                      ? type({
                          size: 20,
                          width: 100,
                          lineHeight,
                          tracking: -0.01,
                          italic: voice,
                          color: voice ? ink.far : ink.ink,
                        })
                      : type({
                          size: 16,
                          width: 94,
                          lineHeight,
                          italic: voice,
                          color: voice ? ink.far : ink.near,
                        })
                  }
                />
                {paragraphs.slice(1).map((p, i) => (
                  <Marked
                    key={i}
                    parts={parts(p, [match])}
                    style={[
                      isFocus
                        ? type({ size: 20, width: 100, lineHeight, color: ink.ink })
                        : type({ size: 16, width: 94, lineHeight, color: ink.near }),
                      { marginTop: 10 },
                    ]}
                  />
                ))}
              </View>
            </View>
          </Pressable>

          {returnContext ? <ReturnContext value={returnContext} now={props.now} /> : null}

          {isFocus && !quietReading && !props.continuing && (props.reminder || showQuietAction) ? (
            <View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, alignItems: 'flex-start' }}>
                {props.reminder ? (
                  <Pressable accessibilityRole="button" onPress={props.reminder.onOpen}
                    style={{ minHeight: 48, minWidth: 48, justifyContent: 'center' }}>
                    <Text style={type({ size: 14, width: 94, weight: agency.weight, color: agency.ink })}>
                      {props.reminder.label}
                    </Text>
                  </Pressable>
                ) : null}
                {showQuietAction ? (
                  <Pressable accessibilityRole="button" onPress={onQuiet}
                    style={({ pressed }) => ({ minHeight: 48, minWidth: 48, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                    <Text style={type({ size: 14, width: 94, color: ink.far })}>quiet reading</Text>
                  </Pressable>
                ) : null}
              </View>
              {props.reminder?.notice ? (
                <Text accessibilityRole="alert" style={type({ size: 13, width: 92, color: ink.far })}>
                  {props.reminder.notice}
                </Text>
              ) : null}
            </View>
          ) : null}
          {m.url ? (
            <Text style={[type({ size: 12, width: 90, color: ink.meta }), { marginTop: 4 }]}>
              {m.title ? `${m.domain ?? ''} · ${m.title}` : (m.domain ?? m.url)}
            </Text>
          ) : null}

          {!quietReading && props.shownPrevious[m.id] && m.previousBody ? (
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
                style={type({ size: 14, width: 92, color: agency.ink, weight: agency.weight })}
              >
                correct
              </Text>
              <Text
                onPress={() => props.onHold(m)}
                style={type({ size: 14, width: 92, color: agency.ink, weight: agency.weight })}
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

/** A recorded match in words or source. Possibilities have their own comparison. */
function TraceRow({ trace, now, onOpen }: { trace: Trace; now: number; onOpen: () => void }) {
  const { ink, evidence } = useRecordTheme();
  const kindLabel = trace.kind === 'same_source' ? 'same source' : 'same words';
  const when =
    now - trace.material.at < 7 * 864e5
      ? dayLabel(trace.material.at, now)
      : monthLabel(trace.material.at, now);
  const text = trace.phrase
    ? snippet(displayText(trace.material).replace(/\n+/g, ' '), trace.phrase)
    : displayText(trace.material).split('\n')[0].slice(0, 90);

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      style={({ pressed }) => ({
        borderLeftWidth: 2, borderLeftColor: evidence.rail, minHeight: 48,
        paddingLeft: 14, paddingVertical: 4, opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={type({ size: 14, width: 90, color: ink.meta })}>{`${kindLabel} · ${when}`}</Text>
      <Marked
        parts={parts(text, [trace.phrase])}
        quiet
        style={type({ size: 14, width: 90, lineHeight: 1.35, color: ink.far })}
      />
    </Pressable>
  );
}
