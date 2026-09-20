/**
 * `▶ 0:42` — except the mark is drawn rather than typed.
 *
 * It used to be the character U+25B6 inside a `Text` set in Archivo. Archivo has no such
 * glyph, so iOS fell back, and its fallback for that codepoint is Apple Color Emoji: the
 * record grew a small blue rounded play button belonging to somebody else's design system,
 * at somebody else's weight, in a colour the app never chose.
 *
 * Every other mark here is drawn — the ring, the caret, the circle, the level bars — and
 * these two are no different. A triangle and a square, in the chip's own colour, sized off
 * the chip's own type, so `playing` and `not playing` differ by shape rather than by which
 * font happened to answer.
 */

import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { ink, rule } from './tokens';
import { face } from './type';
import { fmtDur } from '../model/time';

export type VoiceChipSpec = {
  fontSize: number;
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
  marginRight: number;
};

export function VoiceChip({
  seconds,
  missing,
  playing,
  spec,
  onPlay,
}: {
  seconds: number;
  missing: boolean;
  playing?: boolean;
  spec: VoiceChipSpec;
  /** Absent at a distance: the chip states the duration but does not play. */
  onPlay?: () => void;
}) {
  const color = missing ? ink.meta : ink.verb;
  // Cap height rather than a full em, so the mark sits with the digits instead of over them.
  const mark = Math.round(spec.fontSize * 0.62);

  const chip = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: Math.round(spec.fontSize * 0.4),
        borderWidth: 1,
        borderColor: rule.line,
        paddingTop: spec.paddingTop,
        paddingBottom: spec.paddingBottom,
        paddingLeft: spec.paddingLeft,
        paddingRight: spec.paddingRight,
        marginRight: spec.marginRight,
        alignSelf: 'flex-start',
      }}
    >
      {missing ? null : playing ? (
        <Stop size={mark} color={color} />
      ) : (
        <Play size={mark} color={color} />
      )}
      <Text
        accessibilityLabel={
          missing ? 'audio gone' : `${playing ? 'stop' : 'play'} ${fmtDur(seconds)}`
        }
        style={{ fontFamily: face(90), fontSize: spec.fontSize, color }}
      >
        {missing ? 'audio gone' : fmtDur(seconds)}
      </Text>
    </View>
  );

  if (missing || !onPlay) return chip;
  return (
    <Pressable onPress={onPlay} hitSlop={8}>
      {chip}
    </Pressable>
  );
}

/** A triangle, made of borders — the one shape React Native draws without a path. */
function Play({ size, color }: { size: number; color: string }) {
  return (
    <View
      style={{
        width: 0,
        height: 0,
        backgroundColor: 'transparent',
        borderStyle: 'solid',
        borderTopWidth: size / 2,
        borderBottomWidth: size / 2,
        borderLeftWidth: Math.round(size * 0.88),
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: color,
      }}
    />
  );
}

function Stop({ size, color }: { size: number; color: string }) {
  const side = Math.round(size * 0.86);
  return <View style={{ width: side, height: side, backgroundColor: color }} />;
}
