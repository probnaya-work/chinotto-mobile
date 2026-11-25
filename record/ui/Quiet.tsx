import React, { useContext, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, Text, View, type TextInputInstance } from 'react-native';
import { initialWindowMetrics, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { composeQuietMessage, quietMessageNotice } from '../quietMessage';
import { thoughtLanded } from '../feedback';
import { Edge } from './Edge';
import { useRecordTheme } from './appearance';
import { dismissKeyboard, useKeyboardInset } from './useKeyboardInset';
import { type } from './type';

export function Quiet({ visible, openRequest, capture, onExit }: {
  openRequest?: number;
  visible: boolean;
  capture: (body: string) => Promise<unknown>;
  onExit: () => void;
}) {
  const { SURFACE, ink, agency } = useRecordTheme();
  const insets = useContext(SafeAreaInsetsContext) ?? initialWindowMetrics?.insets ?? { top: 54, bottom: 34 };
  const [editing, setEditing] = useState(false);
  const [words, setWords] = useState('');
  const wordsNow = useRef('');
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savePending = useRef(false);
  const messagePending = useRef(false);
  const [messaging, setMessaging] = useState(false);
  const [today, setToday] = useState(() => new Date());
  const input = useRef<TextInputInstance>(null);
  const keyboardInset = useKeyboardInset();

  useEffect(() => {
    if (!visible) { setEditing(false); return; }
    const update = () => setToday(new Date());
    update();
    const timer = setInterval(update, 60_000);
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') update(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [visible]);
  useEffect(() => {
    if (visible && editing) input.current?.focus();
  }, [visible, editing]);

  useEffect(() => {
    if (!openRequest) return;
    setEditing(false);
    setNotice(wordsNow.current ? 'Draft kept in Quiet. Tap What arrived? to continue.' : null);
    dismissKeyboard();
  }, [openRequest]);

  const change = (text: string) => { wordsNow.current = text; setWords(text); };
  const save = async () => {
    const body = wordsNow.current.trim();
    if (!body || savePending.current) return;
    savePending.current = true;
    setSaving(true);
    setNotice(null);
    try {
      // The same local store and write-through privacy policy as the Record's edge.
      // Do not await a reload or sync after commit: retrying that would duplicate a thought.
      await capture(body);
    } catch {
      setNotice('Could not save. Your words are still here. Try again.');
      savePending.current = false;
      setSaving(false);
      return;
    }
    change('');
    setEditing(false);
    dismissKeyboard();
    setNotice('Saved to your Record.');
    savePending.current = false;
    setSaving(false);
    thoughtLanded();
  };
  const message = async () => {
    if (messagePending.current) return;
    messagePending.current = true;
    setMessaging(true);
    setNotice(null);
    const result = await composeQuietMessage();
    setNotice(quietMessageNotice[result]);
    messagePending.current = false;
    setMessaging(false);
  };
  const cancel = () => {
    if (savePending.current) return;
    setEditing(false);
    dismissKeyboard();
    setNotice(wordsNow.current ? 'Draft kept in Quiet. Tap What arrived? to continue.' : null);
  };

  if (!visible) return null;
  return <View testID="quiet" accessibilityViewIsModal style={{ position: 'absolute', inset: 0,
    backgroundColor: SURFACE, zIndex: 12 }}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1,
      paddingTop: Math.max(insets.top, 54) + 18, paddingBottom: Math.max(insets.bottom, 24) + 18,
      paddingHorizontal: 28 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
        <Text style={type({ size: 19, width: 100, color: ink.ink })}>Chinotto</Text>
        <Text style={type({ size: 14, width: 94, color: ink.meta })}>
          {today.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}
        </Text>
      </View>
      <Text style={[type({ size: 13, width: 94, color: ink.meta }), { marginTop: 10 }]}>In-app Quiet capture</Text>
      {editing ? <Pressable accessibilityRole="button" accessibilityLabel="Back to Quiet"
        disabled={saving} onPress={cancel} style={{ minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' }}>
        <Text style={type({ size: 16, width: 94, weight: agency.weight, color: agency.ink })}>‹ Quiet</Text>
      </Pressable> : null}
      {editing && notice ? <Text accessibilityRole="alert" style={type({ size: 15, width: 94,
        color: ink.meta, lineHeight: 1.5 })}>{notice}</Text> : null}
      <View style={{ flex: 1, minHeight: editing ? 40 : 160 }} />
      {!editing && notice ? <Text accessibilityRole="alert" style={[type({ size: 15, width: 94,
        color: ink.meta, lineHeight: 1.5 }), { marginBottom: 24 }]}>{notice}</Text> : null}
      {saving ? <Text accessibilityLiveRegion="polite" style={type({ size: 15, width: 94, color: ink.meta })}>Saving…</Text> : null}
      {!editing ? <View style={{ gap: 18 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="What arrived?" onPress={() => { setNotice(null); setEditing(true); }}
          style={{ minHeight: 64, justifyContent: 'center' }}>
          <Text maxFontSizeMultiplier={2} style={{ fontFamily: 'Georgia', fontSize: 36, color: ink.ink }}>What arrived?</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Message" disabled={messaging} onPress={() => void message()}
          style={{ minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' }}>
          <Text style={type({ size: 19, width: 94, weight: agency.weight, color: agency.ink })}>{messaging ? 'Opening Messages…' : 'Message'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Record" onPress={() => { dismissKeyboard(); onExit(); }}
          style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
          <Text style={type({ size: 15, width: 94, color: ink.meta })}>Back to Record</Text>
        </Pressable>
      </View> : <View style={{ minHeight: 240 }} />}
    </ScrollView>
    {editing ? <Edge captureOnly saving={saving} input={words} onChangeInput={change} onSubmit={() => void save()}
      inputRef={input} focused onFocus={() => {}} onBlur={() => {}} onPressCaret={() => input.current?.focus()}
      anchored={false} onClearAnchor={() => {}} findSummary={null} recording={null} voice={false}
      onStartRecording={() => {}} onStopRecording={() => {}} onCancelRecording={() => {}}
      notices={[]} keyboardInset={keyboardInset} /> : null}
  </View>;
}
