/** Development-only Find study. Nothing in the production Record imports this file. */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { agency, ink } from '../ui/tokens';
import { frame } from '../ui/tokens';
import { type } from '../ui/type';

type PreviewState = {
  width: number;
  fontScale: number;
  safeTop: number;
  anchored: boolean;
  focused: boolean;
  keyboardVisible: boolean;
};

export function findPreviewLayout(state: PreviewState) {
  const visible = state.width >= 360 && state.fontScale <= 1.3 &&
    !state.anchored && !state.focused && !state.keyboardVisible;
  return {
    visible,
    top: Math.max(frame.statusBarHeight, state.safeTop) + 2,
    right: 24,
    hitWidth: 88,
    hitHeight: 44,
    pullResponderRightInset: visible ? 112 : 0,
  };
}

/** Enters the existing slash command and keeps the capture keyboard focus. */
export function enterExistingFind(setInput: (text: string) => void, focusInput: () => void) {
  setInput('/');
  focusInput();
}

export function FindAffordancePreview(props: PreviewState & { setInput: (text: string) => void; focusInput: () => void }) {
  const layout = findPreviewLayout(props);
  if (!layout.visible) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: layout.top, right: layout.right, zIndex: 4 }}>
      <Pressable
        testID="find-preview"
        accessibilityRole="button"
        accessibilityLabel="Find in the Record"
        onPress={() => enterExistingFind(props.setInput, props.focusInput)}
        style={{ minWidth: layout.hitWidth, minHeight: layout.hitHeight, alignItems: 'flex-end', justifyContent: 'center' }}
      >
        <Text style={type({ size: 12, width: 90, color: agency.quiet })}>FIND <Text style={{ color: ink.meta }}>/</Text></Text>
      </Pressable>
    </View>
  );
}
