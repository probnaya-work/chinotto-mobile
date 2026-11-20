import React, { useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, Text, View } from 'react-native';
import { ReminderError, type Reminders, type ThoughtReminder } from '../reminders';
import { postponeReminder, reminderDate, reminderPresets, reminderTime } from '../reminderTime';
import { useRecordTheme } from './appearance';
import { ReminderDatePicker } from './ReminderDatePicker';
import { type } from './type';

export type ReminderDraft = {
  fragmentId: string;
  openedAt: number;
  at: number;
  custom: boolean;
  step: 'choose' | 'manage' | 'permission' | 'denied' | 'cancel';
  existing: ThoughtReminder | null;
};

export function reminderDraft(fragmentId: string, existing: ThoughtReminder | null): ReminderDraft {
  const openedAt = Date.now();
  return {
    fragmentId, openedAt, existing, custom: false,
    at: existing?.at ?? reminderPresets(openedAt)[1].at,
    step: existing ? 'manage' : 'choose',
  };
}

type Props = {
  draft: ReminderDraft;
  change: (draft: ReminderDraft) => void;
  reminders: Reminders;
  done: (reminder: ThoughtReminder | null, notice?: string) => void;
  close: () => void;
  openSettings: () => void;
};

export function ReminderSheet({ draft, change, reminders, done, close, openSettings }: Props) {
  const { SURFACE, veil, ink, agency, rule } = useRecordTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState<boolean | null>(null);
  const existing = draft.existing;
  const existingId = existing?.id;
  const { step, at, openedAt } = draft;

  useEffect(() => {
    if (!existingId || step !== 'manage') return;
    let active = true;
    const refresh = () => {
      void reminders.scheduled(existingId).then(
        (value) => { if (active) setScheduled(value); },
        () => { if (active) setScheduled(false); },
      );
    };
    refresh();
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { active = false; sub.remove(); };
  }, [existingId, reminders, step]);

  const edit = (options: Partial<ReminderDraft>) => { setError(null); change({ ...draft, ...options }); };
  const readout = (time: number) => (
    <View style={{
      flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
      gap: 8, borderBottomWidth: 1, borderBottomColor: rule.line, paddingTop: 8, paddingBottom: 14, marginBottom: 4,
    }}>
      <Text style={[type({ size: 48, width: 100, color: ink.ink, tracking: -0.055 }), { fontVariant: ['tabular-nums'], flexShrink: 1 }]}>
        {reminderTime(time)}
      </Text>
      <View style={{ flexShrink: 1 }}>
        <Text style={type({ size: 14, width: 94, color: ink.near })}>{reminderDate(time)}</Text>
        <Text style={type({ size: 12, width: 90, color: ink.meta })}>once · on this iphone</Text>
      </View>
    </View>
  );

  async function save(time: number, ask = false) {
    if (busy) return;
    if (!Number.isFinite(time) || time <= Date.now()) {
      setError('choose a time in the future.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const permission = ask ? await reminders.requestPermission() : await reminders.permission();
      if (permission !== 'granted') {
        edit({ at: time, step: permission === 'ask' && !ask ? 'permission' : 'denied' });
        return;
      }
      const result = await reminders.save(draft.fragmentId, time);
      done(result.reminder, result.scheduled ? undefined : 'time saved · the alert is unavailable');
    } catch (cause) {
      if (cause instanceof ReminderError && cause.reason === 'denied') edit({ at: time, step: 'denied' });
      else if (cause instanceof ReminderError && cause.reason === 'past') setError('choose a time in the future.');
      else if (cause instanceof ReminderError && cause.reason === 'gone') done(null, 'this thought is no longer available');
      else setError('could not set this reminder. try again.');
    } finally { setBusy(false); }
  }

  async function cancel() {
    if (!existingId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await reminders.cancel(existingId);
      done(null);
    } catch {
      setError('could not remove this alert. try again.');
    } finally { setBusy(false); }
  }

  const action = (label: string, onPress: () => void, filled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={{
        minHeight: 44, minWidth: 44, justifyContent: 'center',
        alignItems: filled ? 'center' : 'flex-start',
        backgroundColor: filled ? agency.ink : undefined,
        paddingHorizontal: filled ? 12 : 0, paddingVertical: 8, opacity: busy ? 0.65 : 1,
      }}
    >
      <Text style={type({ size: 15, width: 94, weight: agency.weight, color: filled ? agency.ground : agency.ink })}>
        {label}
      </Text>
    </Pressable>
  );
  const caption = (text: string) => <Text style={type({ size: 14, width: 94, color: ink.far, lineHeight: 1.4 })}>{text}</Text>;
  const heading = step === 'cancel' ? 'cancel reminder?' : step === 'denied' ? 'notifications are off'
    : step === 'permission' ? 'a reminder on this iphone' : step === 'manage' ? 'reminder' : 'remind me';

  return (
    <View style={{
      position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 6,
      backgroundColor: veil, justifyContent: 'flex-end',
    }}>
      <View
        accessibilityViewIsModal
        onAccessibilityEscape={busy ? undefined : close}
        style={{
          backgroundColor: SURFACE, maxHeight: '90%', paddingHorizontal: 24, paddingBottom: 40,
          borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTopWidth: 1, borderColor: rule.line,
        }}
      >
        <View style={{
          height: 3, width: 28, borderRadius: 2, backgroundColor: ink.meta, opacity: 0.6,
          alignSelf: 'center', marginTop: 8, marginBottom: 3,
        }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text accessibilityRole="header" style={[type({ size: 23, width: 100, color: agency.quiet }), { flexShrink: 1 }]}>
            {heading}
          </Text>
          {action('close', close)}
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
          {step === 'choose' ? <>
            {readout(at)}
            {draft.custom ? <>
              <ReminderDatePicker at={at} onChange={(value) => edit({ at: value })} />
              {action('‹ use a preset', () => edit({ custom: false }))}
            </> : <>
              {reminderPresets(openedAt).map((preset) => (
                <Pressable
                  key={preset.label}
                  accessibilityRole="button"
                  accessibilityLabel={`${preset.label}, ${reminderDate(preset.at)}, ${reminderTime(preset.at)}`}
                  accessibilityState={{ selected: at === preset.at, disabled: busy }}
                  disabled={busy}
                  onPress={() => edit({ at: preset.at })}
                  style={{
                    minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: rule.hair,
                  }}
                >
                  <Text style={[type({ size: 15, width: 94, weight: at === preset.at ? agency.weight : 400, color: agency.ink }), { flexShrink: 1 }]}>
                    {at === preset.at ? '•  ' : ''}{preset.label}
                  </Text>
                  <Text style={type({ size: 12, width: 90, color: ink.meta })}>{reminderTime(preset.at)}</Text>
                </Pressable>
              ))}
              {action('custom date and time ›', () => edit({ custom: true }))}
            </>}
            {action(busy ? 'setting…' : draft.existing ? 'save changes' : 'set reminder', () => void save(at), true)}
          </> : step === 'manage' && existing ? <>
            {readout(existing.at)}
            {scheduled === false ? caption('the time is saved here · alerts are unavailable') : null}
            {scheduled === false ? action('try setting the alert again', () => void save(existing.at)) : null}
            {action('change time ›', () => edit({ step: 'choose', at: existing.at }))}
            {action('postpone one day ›', () => void save(postponeReminder(existing.at)))}
            {action('cancel reminder ›', () => edit({ step: 'cancel' }))}
          </> : step === 'cancel' ? <>
            {caption('the alert will be removed. the thought stays in your record.')}
            {action('keep reminder', () => edit({ step: 'manage' }), true)}
            {action('cancel reminder', () => void cancel())}
          </> : <>
            {readout(at)}
            {step === 'permission' ? <>
              {caption('chinotto can send one alert at this time. the words stay inside chinotto.')}
              {action('continue to system prompt', () => void save(at, true), true)}
            </> : <>
              {caption('allow alerts in iPhone Settings, then come back to set this time.')}
              {action('open iPhone Settings ›', openSettings)}
              {action('check and set reminder', () => void save(at), true)}
            </>}
            {action('‹ change time', () => edit({ step: 'choose' }))}
          </>}
          {error ? <Text accessibilityRole="alert" style={type({ size: 14, width: 94, color: ink.ink })}>{error}</Text> : null}
        </ScrollView>
      </View>
    </View>
  );
}
