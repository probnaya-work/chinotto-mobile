import { QuietGuideIcon } from './QuietGuideIcon';
import { useRecordTheme } from './appearance';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View, type TextInputInstance } from 'react-native';
import { Edge, useReducedMotion, type EdgeProps } from './Edge';
import { RecordOpening } from './record-opening';
import { dismissKeyboard, useKeyboardInset } from './useKeyboardInset';

import { type } from './type';

export function LockedCapture({ capture, words, change, onUnlock, busy, error, onSettings, onOpenQuietGuide, voice }: {
  capture: (body: string) => Promise<unknown>;
  words: string;
  change: (text: string) => void;
  onUnlock: () => void;
  busy: boolean;
  error: string | null;
  onSettings: () => void;
  onOpenQuietGuide?: () => void;
  voice: Pick<EdgeProps, 'recording' | 'voice' | 'onStartRecording' | 'onStopRecording' | 'onCancelRecording'>;
}) {
  const { ink, SURFACE } = useRecordTheme();

  const wordsNow = useRef(words);
  wordsNow.current = words;
  const [message, setMessage] = useState('the record is locked. a new thought can still land.');
  const input = useRef<TextInputInstance>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const keyboardInset = useKeyboardInset();
  const reducedMotion = useReducedMotion();
  const save = async () => {
    const text = wordsNow.current;
    if (!text.trim()) return;
    change('');
    try { await capture(text); setMessage('saved on this phone.'); }
    catch { change(text); setMessage('could not save. your words are still here.'); }
  };
  return <View style={{ flex: 1, backgroundColor: SURFACE, paddingTop: 90 }}>
    <View style={{ paddingHorizontal: 24, gap: 18 }}>
      <Text style={type({ size: 15, width: 90, color: ink.meta })}>{error ?? message}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="open the record" disabled={busy} onPress={onUnlock}>
        <Text style={type({ size: 17, width: 90, color: ink.near })}>{busy ? 'authenticating…' : 'open the record ›'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onSettings}>
        <Text style={type({ size: 13, width: 90, color: ink.meta })}>settings</Text>
      </Pressable>
      {onOpenQuietGuide ? <Pressable accessibilityRole="button" accessibilityLabel="Quiet Home Screen guide" onPress={() => { dismissKeyboard(); onOpenQuietGuide(); }}
        style={{ minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
        <QuietGuideIcon />
      </Pressable> : null}
    </View>
    {busy ? <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0,
      bottom: keyboardInset, justifyContent: 'center' }}>
      <RecordOpening reducedMotion={reducedMotion} />
    </Animated.View> : null}
    <Edge captureOnly input={words} onChangeInput={(text) => { wordsNow.current = text; change(text); }} onSubmit={() => void save()} inputRef={input}
      focused={true} onFocus={() => {}} onBlur={() => {}} onPressCaret={() => input.current?.focus()}
      anchored={false} onClearAnchor={() => {}} findSummary={null} notices={[]}
      keyboardInset={keyboardInset} {...voice} />
  </View>;
}
