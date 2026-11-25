import React, { useContext } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { initialWindowMetrics, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useRecordAppearance, useRecordTheme } from './appearance';
import { type } from './type';

const setup = [
  ['Settings › Focus › Personal', 'Under Customize Screens, choose Home Screen. Pick a suggested page and tap Add.'],
  ['Control Center › Focus › Personal', 'Swipe down from the top right to open Control Center. Turn on Personal, then go Home.'],
  ['Edit › Add Widget › Chinotto', 'Hold the page background to reveal Edit. Choose Chinotto Quiet in Medium or Large, then tap Add Widget and Done.'],
] as const;

export function QuietHomeGuide({ onClose, backTo = 'Record' }: {
  onClose: () => void; backTo?: 'Record' | 'Settings';
}) {
  const { SURFACE, ink, bandLabel, rule, mode } = useRecordTheme();
  const { contrast } = useRecordAppearance();
  const insets = useContext(SafeAreaInsetsContext) ?? initialWindowMetrics?.insets;
  const label = type({ size: 13, width: 90, color: bandLabel.color });
  const action = type({ size: 16, width: 96, color: ink.ink });
  const body = type({ size: 14, width: 94, lineHeight: 1.35, color: ink.near });

  return <View accessibilityViewIsModal style={{ position: 'absolute', inset: 0, zIndex: 12,
    paddingTop: Math.max(insets?.top ?? 54, 24), backgroundColor: SURFACE }}>
    {!contrast && <View pointerEvents="none" accessible={false} accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <Image accessible={false} source={require('../../assets/quiet/header-paper.png')}
        resizeMode="cover" style={{ width: '100%', height: '100%', opacity: mode === 'dark' ? 0.032 : 0.028 }} />
    </View>}
    <Pressable accessibilityRole="button" onPress={onClose} style={styles.back}>
      <Text style={type({ size: 14, width: 94, color: ink.near })}>{`‹ ${backTo}`}</Text>
    </Pressable>
    <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: (insets?.bottom ?? 32) + 20 }}>
      <Text accessibilityRole="header" style={[type({ size: 25, width: 96, color: ink.ink }), styles.title]}>Quiet Home Screen</Text>
      <Text accessibilityRole="header" style={label}>Set up once</Text>
      <View style={styles.steps}>
        {setup.map(([path, detail], index) => <View key={path} style={styles.row}>
          <Text accessible={false} accessibilityElementsHidden importantForAccessibility="no"
            style={[label, styles.number]}>{index + 1}</Text>
          <View style={styles.copy}>
            <Text accessibilityRole="header" accessibilityLabel={`Step ${index + 1}. ${path}`} style={action}>{path}</Text>
            <Text style={body}>{detail}</Text>
          </View>
        </View>)}
      </View>
      <View style={[styles.daily, { borderTopColor: rule.hair }]}>
        <Text accessibilityRole="header" style={label}>Daily use</Text>
        <Text style={body}>Turn on Personal in Control Center. Tap “What arrived?” to write or the green disc to record.</Text>
        <Text style={body}>Swipe Home to return to Quiet. Turn Personal off to bring back your usual pages.</Text>
      </View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  back: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 24 },
  title: { marginTop: 6, marginBottom: 18 },
  steps: { marginTop: 10, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  number: { minWidth: 12, marginTop: 2, fontVariant: ['tabular-nums'] },
  copy: { flexShrink: 1, gap: 3 },
  daily: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 19, paddingTop: 14, gap: 7 },
});
