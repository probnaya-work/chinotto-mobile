import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';

import { displayText, firstLine } from '../model/material';
import { becauseSentence, type RecordReturn } from '../model/returns';
import { ago, fullDate, monthLabel, MS_DAY } from '../model/time';
import { parts } from '../model/words';
import { useRecordTheme } from './appearance';
import { Marked } from './Marked';
import { motion } from './tokens';
import { type } from './type';

type ReturnBlockProps = {
  value: RecordReturn;
  now: number;
  leaving: boolean;
  reducedMotion: boolean;
  onOpen: () => void;
  onLetGo: () => void;
};

export function ReturnBlock({ value, now, leaving, reducedMotion, onOpen, onLetGo }: ReturnBlockProps) {
  const { ink, rule, agency } = useRecordTheme();
  const progress = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;

  useEffect(() => {
    const target = leaving ? 0 : 1;
    if (reducedMotion) {
      progress.setValue(target);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: target,
      duration: leaving ? motion.letGo : motion.rise,
      easing: leaving ? Easing.in(Easing.ease) : Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [leaving, progress, reducedMotion]);

  const date = `back from ${monthLabel(value.material.at, now, true)}`;
  const days = Math.floor((now - value.material.at) / MS_DAY);
  const distance = ago(value.material.at, now);
  const age = days < 30 ? `${days} days ago` : `${distance === '1 months' ? '1 month' : distance} ago`;
  const preview = firstLine(value.material);

  return (
    <Animated.View
      accessibilityElementsHidden={leaving}
      importantForAccessibility={leaving ? 'no-hide-descendants' : 'auto'}
      style={{
        marginBottom: 14,
        paddingLeft: 14,
        borderLeftWidth: 1,
        borderLeftColor: rule.line,
        opacity: progress,
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
      }}
    >
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: -3, top: 12, width: 6, height: 6, backgroundColor: agency.quiet }}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${date}, ${age}. ${preview}`}
          accessibilityHint="opens the thought and shows why it came back"
          disabled={leaving}
          onPress={onOpen}
          style={({ pressed }) => ({
            flexGrow: 1, flexShrink: 1, flexBasis: '60%', minWidth: 48, minHeight: 48,
            justifyContent: 'center', paddingVertical: 6, gap: 3, opacity: pressed ? 0.7 : 1,
          })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8 }}>
            <Text style={type({ size: 14, width: 94, color: ink.ink, weight: agency.weight })}>{date} ›</Text>
            <Text style={type({ size: 12, width: 90, color: ink.meta })}>{age}</Text>
          </View>
          <Marked
            parts={parts(preview, [value.phraseOld])}
            numberOfLines={1}
            style={type({ size: 16, width: 100, lineHeight: 1.34, color: ink.near })}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="let go"
          accessibilityHint="dismisses this return"
          disabled={leaving}
          onPress={onLetGo}
          style={({ pressed }) => ({
            minHeight: 48, minWidth: 48, marginLeft: 'auto',
            alignItems: 'flex-end', justifyContent: 'center', opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={type({ size: 14, width: 92, color: ink.far })}>let go</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

export function ReturnContext({ value, now }: { value: RecordReturn; now: number }) {
  const { ink, rule } = useRecordTheme();
  const { lead, quote, tail } = becauseSentence(value, now);
  const excerpt = quote && (parts(displayText(value.because), [quote]).find((part) => part.m)?.t ?? quote);
  const reasonStyle = type({ size: 14, width: 92, lineHeight: 1.4, color: ink.far });
  return (
    <View style={{ marginTop: 12, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: rule.line, gap: 3 }}>
      <Text style={type({ size: 12, width: 90, color: ink.meta })}>
        {`why it came back · ${fullDate(value.because.at)}`}
      </Text>
      <Text style={reasonStyle}>
        {lead}
        {excerpt ? <Marked parts={[{ t: excerpt, m: true, n: false }]} style={reasonStyle} /> : null}
        {tail}
      </Text>
    </View>
  );
}
