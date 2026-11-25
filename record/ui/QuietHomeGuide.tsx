import React, { useContext } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { initialWindowMetrics, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useRecordTheme } from './appearance';
import { type } from './type';

const steps = [
  ['Make a page', 'Touch and hold the Home Screen background. Swipe left past your last page to a blank one. Tap Edit, then Add Widget. Choose Chinotto from the list, slide across the preview dots to Chinotto Quiet, then tap Add Widget and Done.'],
  ['Use your usual apps', 'Keep Phone, Messages and Maps wherever you can already reach them on this page or in the Dock. For a missing icon, swipe left to App Library. Find the icon in its category. Hold it past the menu until it lifts, then drag it onto the widget page. Tap Done.'],
  ['Connect the page to Quiet', 'In iPhone Settings, open Focus, tap +, then Custom. Name it Quiet. Under Customize Screens, choose the Home Screen and select just the widget page.'],
  ['On your walk', 'Swipe down from the top right to open Control Center. Tap Focus and choose Quiet. Open Messages from its icon and swipe Home to find your widget again. Turn Quiet off in Control Center to return to your usual pages.'],
  ['If the extra page stays visible', 'With Quiet off, touch and hold the Home Screen background, tap the page dots and uncheck only the widget page. Tap Done. Switch Quiet on again to check the page appears.'],
] as const;

export function QuietHomeGuide({ onClose, onCapture }: { onClose: () => void; onCapture: () => void }) {
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
    </ScrollView>
  </View>;
}
