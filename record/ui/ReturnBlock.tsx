/**
 * The Return, waiting at the edge.
 *
 * Four lines and four verbs, in this order and no other:
 *
 *     back from mar 2023 · 3 years
 *     {the moment, with the repeated words lit}
 *     you wrote "{the words that brought it back}" at 11:05
 *     continue · open · hold                            let go
 *
 * The third line is the whole feature. A Return that cannot produce it does not appear at
 * all — see `model/returns.ts`. Nothing here ever renders a Return without a reason, because
 * nothing here is given one.
 *
 * `let go` animates out over 450ms rather than vanishing: it is a decision about something,
 * and it should look like the thing leaving rather than like a click registering.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';

import { Marked } from './Marked';
import { ink, motion } from './tokens';
import { type } from './type';
import { becauseSentence, type RecordReturn } from '../model/returns';
import { displayText, type Material } from '../model/material';
import { ago, monthLabel } from '../model/time';
import { parts } from '../model/words';

export type ReturnBlockProps = {
  value: RecordReturn;
  now: number;
  leaving: boolean;
  onOpen: () => void;
  onContinue: () => void;
  onHold: () => void;
  onLetGo: () => void;
};

export function ReturnBlock({
  value,
  now,
  leaving,
  onOpen,
  onContinue,
  onHold,
  onLetGo,
}: ReturnBlockProps) {
  const enter = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: motion.rise,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter]);

  useEffect(() => {
    if (!leaving) return;
    Animated.timing(exit, {
      toValue: 1,
      duration: motion.letGo,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [leaving, exit]);

  const because = becauseSentence(value, now);

  return (
    <Animated.View
      style={{
        position: 'relative',
        paddingVertical: 12,
        paddingLeft: 16,
        gap: 8,
        marginBottom: 14,
        opacity: Animated.multiply(enter, exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })),
        transform: [
          {
            translateY: Animated.add(
              enter.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }),
              exit.interpolate({ inputRange: [0, 1], outputRange: [0, 60] })
            ),
          },
        ],
      }}
    >
      {/* The rail is full ink, not a rule: this is material, not chrome. */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 12,
          bottom: 12,
          width: 2,
          backgroundColor: ink.ink,
        }}
      />

      <Text style={type({ size: 12, width: 90, color: ink.meta })}>
        {`back from ${monthLabel(value.material.at, now, true)} · ${ago(value.material.at, now)}`}
      </Text>

      <Marked
        parts={parts(displayText(value.material), [value.phraseOld])}
        onPress={onOpen}
        style={type({ size: 20, width: 100, lineHeight: 1.28, tracking: -0.01, color: ink.ink })}
      />

      <Text style={type({ size: 13, width: 90, lineHeight: 1.4, color: ink.far })}>
        {because.lead}
        {because.quote ? (
          <Marked
            parts={parts(because.quote, [because.quote])}
            style={type({ size: 13, width: 90, lineHeight: 1.4, color: ink.far })}
          />
        ) : null}
        {because.tail}
      </Text>

      <View style={{ flexDirection: 'row', gap: 18, marginTop: 4 }}>
        <Verb label="continue" strong onPress={onContinue} />
        <Verb label="open" onPress={onOpen} />
        <Verb label="hold" onPress={onHold} />
        <View style={{ marginLeft: 'auto' }}>
          <Verb label="let go" onPress={onLetGo} />
        </View>
      </View>
    </Animated.View>
  );
}

/**
 * The verbs read as one quiet line, so the tap target is grown around the text rather than
 * the text being grown into a button. 14pt of type inside 44pt of target.
 */
function Verb({
  label,
  strong,
  onPress,
}: {
  label: string;
  strong?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ minHeight: 44, justifyContent: 'center' }}
      hitSlop={{ left: 6, right: 6 }}
    >
      <Text style={type({ size: 14, width: 92, color: strong ? ink.ink : ink.far })}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Held material the Return offers to keep present, for the caller's convenience. */
export type ReturnTarget = Material;
