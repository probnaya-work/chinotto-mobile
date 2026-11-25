import React, { useContext, useState } from 'react';
import { NativeModules, Pressable, ScrollView, Text, View } from 'react-native';
import { initialWindowMetrics, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useRecordTheme } from './appearance';
import { QuietGuideIcon } from './QuietGuideIcon';
import { type } from './type';

const setup = [
  ['Choose your Quiet page', 'In iPhone Settings → Focus → Personal, choose the Home Screen under Customise Screens. Pick a suggested page and tap Add.'],
  ['Add Chinotto Quiet', 'Turn Personal on in Control Center. Hold the Home Screen background, then tap Edit → Add Widget. Find Chinotto Quiet and choose Medium or Large.'],
] as const;

export function QuietHomeGuide({ onClose, onCapture, backTo = 'Record' }: {
  onClose: () => void; onCapture: () => void; backTo?: 'Record' | 'Settings';
}) {
  const [showPreviousTools, setShowPreviousTools] = useState(false);
  const [error, setError] = useState(false);
  const { SURFACE, ink, bandLabel, rule } = useRecordTheme();
  const insets = useContext(SafeAreaInsetsContext) ?? initialWindowMetrics?.insets;
  const action = type({ size: 16, width: 94, color: ink.near });
  const section = type({ size: 12, width: 94, weight: 540, tracking: 0.07, color: bandLabel.color });
  const body = type({ size: 16, width: 94, lineHeight: 1.36, color: ink.near });
  return <View accessibilityViewIsModal style={{ position: 'absolute', inset: 0, zIndex: 12,
    paddingTop: Math.max(insets?.top ?? 54, 24), backgroundColor: SURFACE }}>
    <Pressable accessibilityRole="button" onPress={onClose}
      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 24 }}>
      <Text style={action}>{`‹ ${backTo}`}</Text>
    </Pressable>
    <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: (insets?.bottom ?? 32) + 20, gap: 17 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 }}>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={type({ size: 38, width: 94, weight: 540, tracking: -0.035, lineHeight: 1.06, color: ink.ink })}>Quiet Home Screen</Text>
        </View>
        <QuietGuideIcon size={46} />
      </View>
      <Text accessibilityRole="header" style={section}>ONE-TIME SETUP</Text>
      {setup.map(([heading, detail]) => <View key={heading} style={{ gap: 5 }}>
        <Text accessibilityRole="header" style={type({ size: 21, width: 94, weight: 540, color: ink.ink })}>{heading}</Text>
        <Text style={body}>{detail}</Text>
      </View>)}
      <View style={{ borderTopWidth: 1, borderTopColor: rule.hair, paddingTop: 16, gap: 10 }}>
        <Text accessibilityRole="header" style={section}>EVERYDAY USE</Text>
        <Text style={body}>Switch Personal on in Control Center to see your Quiet page. Tap “What arrived?” to write or the green disc to record.</Text>
        <Text style={body}>Swipe Home from any app to return to the page. Switch Personal off to bring back your usual pages.</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onCapture} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={action}>Open in-app Quiet capture</Text>
      </Pressable>
      {NativeModules.QuietAppsModule?.open && <Pressable accessibilityRole="button"
        accessibilityState={{ expanded: showPreviousTools }} onPress={() => setShowPreviousTools(!showPreviousTools)}
        style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={action}>Previous app-hiding experiment</Text>
      </Pressable>}
      {showPreviousTools && <View>
        <Text style={action}>Turning off app hiding can move icons to a different page. To restore hidden apps, open the controls below.</Text>
        <Pressable accessibilityRole="button" onPress={async () => {
          setError(false);
          try { await NativeModules.QuietAppsModule.open(); } catch { setError(true); }
        }} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={action}>Hide apps with Quiet</Text>
        </Pressable>
        {error && <Text accessibilityRole="alert" style={action}>Couldn’t open Quiet. Try again.</Text>}
      </View>}
    </ScrollView>
  </View>;
}
