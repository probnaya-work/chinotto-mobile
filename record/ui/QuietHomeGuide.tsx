import React, { useContext, useState } from 'react';
import { NativeModules, Pressable, ScrollView, Text, View } from 'react-native';
import { initialWindowMetrics, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useRecordTheme } from './appearance';
import { type } from './type';

const steps = [
  ['Choose your Quiet page', 'Open iPhone Settings → Focus → Personal → Customise Screens. Choose the Home Screen, pick a suggested page under Create a New Page, then tap Add.'],
  ['Add Chinotto Quiet', 'With Personal Focus on, hold the Home Screen background. Tap Edit → Add Widget, find Chinotto Quiet and choose Medium. Tap Add Widget, then Done. Apps already on the page or in the Dock open as usual.'],
  ['Switch from Control Center', 'Tap Focus → Personal. Swipe Home from Messages to return to the widget. Tap the question to write or the green disc to speak. Turn Personal off to return to your usual pages.'],
] as const;

export function QuietHomeGuide({ onClose, onCapture }: { onClose: () => void; onCapture: () => void }) {
  const [showPreviousTools, setShowPreviousTools] = useState(false);
  const [error, setError] = useState(false);
  const { SURFACE, ink } = useRecordTheme();
  const insets = useContext(SafeAreaInsetsContext) ?? initialWindowMetrics?.insets;
  const action = type({ size: 16, width: 94, color: ink.near });
  return <View accessibilityViewIsModal style={{ position: 'absolute', inset: 0, zIndex: 12,
    paddingTop: Math.max(insets?.top ?? 54, 24), backgroundColor: SURFACE }}>
    <Pressable accessibilityRole="button" onPress={onClose}
      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 24 }}>
      <Text style={action}>‹ Record</Text>
    </Pressable>
    <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: (insets?.bottom ?? 32) + 20, gap: 22 }}>
      <Text accessibilityRole="header" style={{ fontFamily: 'Georgia', fontSize: 32, color: ink.ink }}>Quiet Home Screen</Text>
      {steps.map(([heading, body]) => <View key={heading} style={{ gap: 6 }}>
        <Text accessibilityRole="header" style={type({ size: 19, width: 100, color: ink.ink })}>{heading}</Text>
        <Text style={type({ size: 16, width: 94, lineHeight: 1.4, color: ink.near })}>{body}</Text>
      </View>)}
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
