import React, { useEffect, useState } from 'react';
import { AppState, ScrollView, Text } from 'react-native';
import { firstLine } from '../model/material';
import type { ReminderPermission, ReminderPreferences, Reminders, ReminderStatus } from '../reminders';
import { reminderDate, reminderTime } from '../reminderTime';
import type { RecordStore } from '../store';
import { useRecordTheme } from './appearance';
import { Section, SettingRow } from './Settings';
import { type } from './type';

type NotificationSettingsProps = {
  reminders: Reminders;
  openSystemSettings: () => void;
  openScheduled: () => void;
};

const statusLabel: Record<ReminderStatus, string> = {
  scheduled: 'alert scheduled',
  paused: 'alerts paused in chinotto',
  'alerts-off': 'alerts off in iPhone Settings',
  unavailable: 'alert unavailable',
  'in-app': 'in chinotto only',
  ready: 'ready in chinotto',
};

function SettingsPageContent({ title, children }: { title: string; children: React.ReactNode }) {
  const { agency } = useRecordTheme();
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 18, paddingBottom: 46, gap: 20 }}
    >
      <Text accessibilityRole="header" style={type({ size: 26, width: 100, color: agency.quiet, tracking: -0.02 })}>
        {title}
      </Text>
      {children}
    </ScrollView>
  );
}

function Note({ children, alert = false }: { children: string; alert?: boolean }) {
  const { ink } = useRecordTheme();
  return (
    <Text accessibilityRole={alert ? 'alert' : undefined}
      style={type({ size: 14, width: 94, color: ink.far, lineHeight: 1.4 })}>
      {children}
    </Text>
  );
}

export function NotificationSettings({ reminders, openSystemSettings, openScheduled }: NotificationSettingsProps) {
  const [prefs, setPrefs] = useState<ReminderPreferences | null>(null);
  const [permission, setPermission] = useState<ReminderPermission | null>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    void reminders.preferences().then(
      (value) => { if (active) setPrefs(value); },
      () => { if (active) setError('could not read these settings.'); },
    );
    return () => { active = false; };
  }, [reminders, refresh]);

  useEffect(() => {
    let active = true;
    const read = () => {
      void reminders.permission().then(
        (value) => { if (active) setPermission(value); },
        () => { if (active) setPermission(null); },
      );
    };
    read();
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') read(); });
    return () => { active = false; sub.remove(); };
  }, [reminders, refresh]);

  async function apply(next: ReminderPreferences) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const applied = await reminders.setPreferences(next);
      setPrefs(next);
      if (!applied) setError('the choice is saved. some alerts could not be updated.');
    } catch {
      setError('could not save this choice.');
    } finally {
      setBusy(false);
    }
  }

  const permissionLine = permission === 'granted' ? 'alerts allowed by iOS'
    : permission === 'denied' ? 'alerts off in iPhone Settings'
    : permission === 'ask' ? 'will ask when you set your first alert'
    : permission === undefined ? 'checking permission…' : 'permission unavailable';
  return (
    <SettingsPageContent title="notifications">
      <Section label="on this iphone" gap={0}>
        <SettingRow title="iPhone notification settings" detail={permissionLine} action="open ›" onPress={openSystemSettings} />
        {prefs ? <>
          <SettingRow title="reminder alerts" detail="pause alerts and keep the times you chose"
            status={prefs.paused ? 'paused' : 'on'} accessibilityRole="switch" checked={!prefs.paused}
            disabled={busy} onPress={() => void apply({ ...prefs, paused: !prefs.paused })} />
          <SettingRow title="scheduled reminders" detail="view, change or cancel a time"
            action="open ›" onPress={openScheduled} divider={false} />
        </> : null}
      </Section>
      {prefs ? (
        <Section label="privacy" gap={8}>
          <SettingRow title="discreet previews" detail="show only “Open Chinotto” in the alert"
            status={prefs.discreet ? 'on' : 'off'} accessibilityRole="switch" checked={prefs.discreet}
            disabled={busy} onPress={() => void apply({ ...prefs, discreet: !prefs.discreet })} />
          <Note>thought text stays inside chinotto.</Note>
        </Section>
      ) : null}
      <Note>for quiet hours, use your iPhone’s Focus settings.</Note>
      {error ? <>
        <Note alert>{error}</Note>
        <SettingRow title="try again" onPress={busy ? undefined : () => {
          if (prefs) void apply(prefs);
          else { setError(null); setRefresh((value) => value + 1); }
        }} divider={false} />
      </> : null}
    </SettingsPageContent>
  );
}

type ScheduledRow = Awaited<ReturnType<Reminders['list']>>[number] & { title: string };

export function ScheduledReminders({ reminders, store, readAllowed, unlockBusy, onUnlock, onOpen }: {
  reminders: Reminders;
  store: RecordStore;
  readAllowed: boolean;
  unlockBusy: boolean;
  onUnlock: () => void;
  onOpen: (id: string) => void;
}) {
  const [rows, setRows] = useState<ScheduledRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!readAllowed) { setRows(null); return; }
    let active = true;
    async function load() {
      try {
        const intents = await reminders.list();
        if (!active) return;
        const material = await Promise.all(intents.map(async (item): Promise<ScheduledRow | null> => {
          const thought = await store.getFragment(item.fragmentId);
          return thought && thought.removedAt == null ? { ...item, title: firstLine(thought) || 'a thought' } : null;
        }));
        if (active) { setRows(material.filter((row) => row !== null)); setFailed(false); }
      } catch { if (active) setFailed(true); }
    }
    void load();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => { active = false; sub.remove(); };
  }, [readAllowed, refresh, reminders, store]);

  useEffect(() => {
    if (!readAllowed || !rows) return;
    const next = rows.find(({ at }) => at > Date.now());
    if (!next) return;
    const timer = setTimeout(() => setRefresh((n) => n + 1), Math.min(2_147_483_647, next.at - Date.now()));
    return () => clearTimeout(timer);
  }, [readAllowed, rows]);

  const ready = rows?.filter(({ status }) => status === 'ready') ?? [];
  const upcoming = rows?.filter(({ status }) => status !== 'ready') ?? [];
  const list = (section: ScheduledRow[]) => section.map((item) => (
    <SettingRow
      key={item.id}
      title={item.title}
      detail={`${reminderDate(item.at)} · ${reminderTime(item.at)} · ${statusLabel[item.status]}`}
      accessibilityHint={`${reminderDate(item.at)} · ${reminderTime(item.at)} · ${statusLabel[item.status]}`}
      action={item.status === 'ready' ? 'open ›' : 'manage ›'}
      onPress={() => onOpen(item.id)}
    />
  ));

  return (
    <SettingsPageContent title="scheduled reminders">
      {!readAllowed ? <>
        <Note>open the record to see which thoughts you chose.</Note>
        <SettingRow title="open the record" action={unlockBusy ? 'authenticating…' : 'open ›'}
          onPress={unlockBusy ? undefined : onUnlock} divider={false} />
      </> : failed ? <>
        <Note alert>could not read the reminders.</Note>
        <SettingRow title="try again" onPress={() => { setFailed(false); setRefresh((n) => n + 1); }} divider={false} />
      </> : rows === null ? <Note>opening reminders…</Note>
      : rows.length === 0 ? <Note>no reminders on this iphone. set one from a thought you want to revisit.</Note>
      : <>
        {ready.length ? <Section label="ready in chinotto" gap={0}>{list(ready)}</Section> : null}
        {upcoming.length ? <Section label="upcoming" gap={0}>{list(upcoming)}</Section> : null}
      </>}
    </SettingsPageContent>
  );
}
