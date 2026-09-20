/**
 * The app.
 *
 * Boots the database through the migration ladder, builds the store and the legacy bridge,
 * and mounts the record with every other surface over it. There is no navigator: settings,
 * sync, the share sheet, the widget preview and the update gate are overlays on one place.
 *
 * Boot order matters and is deliberate:
 *
 *   1. the database opens and migrates — nothing else can run before the schema is right;
 *   2. the record renders **immediately**, with the capture field mounted and focused, so
 *      typing is possible before anything else has finished;
 *   3. removals whose undo window elapsed while the app was closed are published;
 *   4. the legacy catch-up and the sync read happen in the background, where they belong.
 *
 * Nothing in 3 or 4 is allowed to block 2. That is the golden rule, expressed as an ordering.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform, View } from 'react-native';
import * as Font from 'expo-font';

import { RecordApp } from './RecordApp';
import { Settings, settingsCopy, type SettingsPage } from './ui/Settings';
import { ShareSurface, metBeforeLabel } from './ui/ShareSurface';
import { SyncSheet } from './ui/SyncSheet';
import { ForcedUpdate, WidgetPreview } from './ui/WidgetPreview';
import { FONT_ASSETS } from './ui/type';
import { SURFACE } from './ui/tokens';
import { createBridge, type RecordBridge } from './bridge';
import { createRecordStore, type RecordStore } from './store';
import { createVoiceCapture, type VoiceEngine } from './voice';
import { readShare, type ShareIntake, type SharePayloadLike } from './share';
import { useSyncSurface, type SyncPorts } from './useSyncSurface';
import { firstLine, type Material } from './model/material';
import { dayLabel, fmtTime, monthLabel } from './model/time';
import { urlKey } from './urlKey';
import type { RecordDb } from './db';

export type Services = {
  db: RecordDb;
  voiceEngine: VoiceEngine;
  syncPorts: SyncPorts;
  newId: () => string;
  deviceName: () => string;
  /** From `resolveUpdateGate`. */
  update: { soft: boolean; forced: boolean; version: string };
  openStore: () => void;
  openSystemSettings: () => void;
  microphonePermission: () => 'granted' | 'ask' | 'denied';
  requestMicrophonePermission: () => void;
  /** Payloads from the share extension, or null when the app was not opened by one. */
  incomingShare: SharePayloadLike[] | null;
  onShareHandled: () => void;
  /** The legacy sync hooks the bridge needs. Omitted when sync is not configured. */
  legacy?: {
    enqueue: (db: RecordDb, entry: { id: string; text: string; createdAt: string }) => Promise<void>;
    dequeue: (db: RecordDb, id: string) => Promise<void>;
    tombstone: (db: RecordDb, id: string) => Promise<void>;
  };
};

type Surface =
  | { kind: 'record' }
  | { kind: 'settings'; page: SettingsPage }
  | { kind: 'widget' };

export function ChinottoApp({ services }: { services: Services }) {
  const [fontsReady, setFontsReady] = useState(false);
  const [surface, setSurface] = useState<Surface>({ kind: 'record' });
  const [share, setShare] = useState<ShareIntake | null>(null);
  const [shareWords, setShareWords] = useState('');
  const [shareMetBefore, setShareMetBefore] = useState('first time here');

  const [appearance, setAppearance] = useState<'system' | 'light' | 'dark'>('system');
  const [sunOn, setSunOn] = useState(false);
  const [icon, setIcon] = useState<'dark' | 'light'>('dark');
  const [analyticsOn, setAnalyticsOn] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  const [recording, setRecording] = useState<{ seconds: number; transcript: string } | null>(null);
  const recordingStartedAt = useRef(0);

  const store: RecordStore = useMemo(
    () =>
      createRecordStore(services.db, {
        newId: services.newId,
        onChanged: (id) => void bridge.mirrorFragment(id),
      }),
    // `bridge` is created below and referenced lazily inside the callback, which is safe
    // because `onChanged` cannot fire before the first write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [services.db, services.newId]
  );

  const bridge: RecordBridge = useMemo(
    () => createBridge(services.db, services.legacy),
    [services.db, services.legacy]
  );

  const voice = useMemo(
    () =>
      createVoiceCapture({
        store,
        engine: services.voiceEngine,
        newId: services.newId,
        onCaptured: (m) => void bridge.mirrorFragment(m.id),
      }),
    [store, bridge, services.voiceEngine, services.newId]
  );

  const sync = useSyncSurface(services.syncPorts, bridge);

  /* --------------------------------------------------------------------- fonts */

  useEffect(() => {
    let alive = true;
    void Font.loadAsync(FONT_ASSETS)
      .catch(() => {
        // A missing face should look wrong, not render nothing: the record still opens.
      })
      .finally(() => {
        if (alive) setFontsReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  /* --------------------------------------------------------------- the catch-up */

  useEffect(() => {
    // Deliberately after first paint, and deliberately not awaited by anything on screen.
    const id = setTimeout(() => {
      void bridge.mirrorCatchUp().catch(() => {});
      void sync.refresh().catch(() => {});
    }, 1200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge]);

  /* --------------------------------------------------------------------- voice */

  useEffect(() => {
    return services.voiceEngine.subscribe({
      onTranscriptPartial: (text) => {
        setRecording((current) =>
          current ? { ...current, transcript: text } : current
        );
      },
      onTranscriptFinal: (text, _reason, audio, failure) => {
        setRecording(null);
        void voice.settle(text, audio, failure);
      },
      onError: () => setRecording(null),
    });
  }, [services.voiceEngine, voice]);

  /** The elapsed counter only runs while something is being said. */
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => {
      setRecording((current) =>
        current
          ? { ...current, seconds: (Date.now() - recordingStartedAt.current) / 1000 }
          : current
      );
    }, 100);
    return () => clearInterval(id);
  }, [recording !== null]);

  const startVoice = useCallback(async () => {
    recordingStartedAt.current = Date.now();
    setRecording({ seconds: 0, transcript: '' });
    try {
      await voice.start();
      return true;
    } catch {
      setRecording(null);
      return false;
    }
  }, [voice]);

  const stopVoice = useCallback(async () => {
    voice.stop();
  }, [voice]);

  /* --------------------------------------------------------------------- share */

  useEffect(() => {
    if (!services.incomingShare) return;
    const intake = readShare(services.incomingShare);
    services.onShareHandled();
    if (!intake) return;

    setShare(intake);
    setShareWords('');

    // "you met this site before" is read from the record, offline, before the surface draws.
    if (intake.url) {
      void (async () => {
        const met = await store.encountersOf(urlKey(intake.url!));
        setShareMetBefore(
          metBeforeLabel(met.map((m) => monthLabel(m.at, Date.now(), true)))
        );
      })();
    } else {
      setShareMetBefore('first time here');
    }
  }, [services.incomingShare, services.onShareHandled, store]);

  const leaveShare = useCallback(async () => {
    if (!share) return;
    const words = shareWords.trim();
    const created = await store.capture({
      body: share.url ? words : (share.text ?? words),
      method: 'shared',
      origin: 'share',
      encounter: share.url
        ? { urlRaw: share.url, sourceApp: 'share', selectedText: share.selectedText }
        : null,
    });
    // The sharing app's title is enrichment, not the person's words, so it goes where
    // enrichment goes rather than into the body.
    if (share.url && share.title) {
      await store.setEnrichment(created.id, { state: 'ok', title: share.title });
    }
    void bridge.mirrorFragment(created.id);
    setShare(null);
    setShareWords('');
  }, [share, shareWords, store, bridge]);

  /* --------------------------------------------------------------- deep links */

  useEffect(() => {
    const open = (url: string) => {
      // `chinotto://capture` and the widget's deep link both mean one thing: put the caret
      // in the field. There is nowhere else to go.
      if (url.includes('capture') || url.includes('widget')) {
        setSurface({ kind: 'record' });
        setShare(null);
      }
    };
    void Linking.getInitialURL().then((url) => {
      if (url) open(url);
    });
    const sub = Linking.addEventListener('url', (e) => open(e.url));
    return () => sub.remove();
  }, []);

  /* --------------------------------------------------------------------- gate */

  if (services.update.forced) {
    return <ForcedUpdate version={services.update.version} onUpdate={services.openStore} />;
  }

  const coldStart = useRef(AppState.currentState !== 'background').current;

  return (
    <View style={{ flex: 1, backgroundColor: SURFACE }}>
      <RecordApp
        store={store}
        bridge={bridge}
        coldStart={coldStart && fontsReady}
        onOpenSettings={() => setSurface({ kind: 'settings', page: 'root' })}
        voice={{
          start: startVoice,
          stop: stopVoice,
          state: recording,
          permission: services.microphonePermission(),
          onRequestPermission: services.requestMicrophonePermission,
          openSystemSettings: services.openSystemSettings,
        }}
        sync={{ notice: sync.notice, onOpen: () => sync.setOpen(true) }}
        update={{
          soft: services.update.soft && !updateDismissed,
          onUpdate: () => {
            setUpdateDismissed(true);
            services.openStore();
          },
          onLater: () => setUpdateDismissed(true),
        }}
      />

      {surface.kind === 'settings' ? (
        <SettingsSurface
          page={surface.page}
          setPage={(page) => setSurface({ kind: 'settings', page })}
          onClose={() => setSurface({ kind: 'record' })}
          onSeeWidget={() => setSurface({ kind: 'widget' })}
          onOpenSync={() => sync.setOpen(true)}
          sync={sync}
          services={services}
          appearance={appearance}
          setAppearance={setAppearance}
          sunOn={sunOn}
          setSunOn={setSunOn}
          icon={icon}
          setIcon={setIcon}
          analyticsOn={analyticsOn}
          setAnalyticsOn={setAnalyticsOn}
          privacyOpen={privacyOpen}
          setPrivacyOpen={setPrivacyOpen}
          deleteArmed={deleteArmed}
          setDeleteArmed={setDeleteArmed}
        />
      ) : null}

      {surface.kind === 'widget' ? (
        <WidgetLive
          store={store}
          onClose={() => setSurface({ kind: 'settings', page: 'root' })}
          onCapture={() => setSurface({ kind: 'record' })}
        />
      ) : null}

      {sync.open ? (
        <SyncSheet
          state={sync.state}
          offline={sync.offline}
          pending={sync.pending}
          onClose={() => {
            sync.setOpen(false);
            sync.cancelConfirm();
          }}
          plans={[
            { id: 'yearly', name: 'a year', price: '[price]', note: '[saving]' },
            { id: 'monthly', name: 'a month', price: '[price]', note: '[trial]' },
          ]}
          chosenPlan="yearly"
          onPickPlan={() => {}}
          planCta="continue · [price] a year"
          onContinueWithPlan={() => {}}
          onRestore={() => {}}
          errorMessage={null}
          onContinueWithApple={() => {}}
          connectingLine="signing in…"
          devices={sync.devices}
          justEnabled={false}
          linkCopyLabel={sync.copied ? 'copied' : 'copy the link'}
          onCopyLink={sync.markCopied}
          confirming={sync.confirming}
          confirmingDeviceName={sync.confirmingDeviceName}
          onAskRemoveDevice={sync.askRemoveDevice}
          onRemoveDevice={sync.cancelConfirm}
          onAskStop={sync.askStop}
          onStop={sync.cancelConfirm}
          onCancelConfirm={sync.cancelConfirm}
          conflict={sync.conflict}
          onKeepWording={(which) => void sync.keepWording(which, store.correct)}
          onSettleConflict={() => void sync.settleConflict(store.correct)}
          onSignInAgain={() => {}}
          errorWhen={sync.errorWhen}
        />
      ) : null}

      {share ? (
        <ShareSurface
          title={share.title}
          domain={share.url ? new URL(share.url).hostname.replace(/^www\./, '') : null}
          selectedText={share.selectedText}
          text={share.text}
          metBefore={shareMetBefore}
          fromLabel={`from ${Platform.OS === 'ios' ? 'another app' : 'elsewhere'} · just now`}
          words={shareWords}
          onChangeWords={setShareWords}
          onLeaveIt={() => void leaveShare()}
          onNotNow={() => setShare(null)}
        />
      ) : null}
    </View>
  );
}

/** Settings, with everything it needs to say what is true read from the real state. */
function SettingsSurface(props: {
  page: SettingsPage;
  setPage: (page: SettingsPage) => void;
  onClose: () => void;
  onSeeWidget: () => void;
  onOpenSync: () => void;
  sync: ReturnType<typeof useSyncSurface>;
  services: Services;
  appearance: 'system' | 'light' | 'dark';
  setAppearance: (v: 'system' | 'light' | 'dark') => void;
  sunOn: boolean;
  setSunOn: (v: boolean) => void;
  icon: 'dark' | 'light';
  setIcon: (v: 'dark' | 'light') => void;
  analyticsOn: boolean;
  setAnalyticsOn: (v: boolean) => void;
  privacyOpen: boolean;
  setPrivacyOpen: (v: boolean) => void;
  deleteArmed: boolean;
  setDeleteArmed: (v: boolean) => void;
}) {
  const permission = props.services.microphonePermission();
  return (
    <Settings
      page={props.page}
      onClose={props.onClose}
      onBack={() => {
        props.setPage('root');
        props.setDeleteArmed(false);
      }}
      syncLine={settingsCopy.sync({
        on: props.sync.state === 'on',
        offline: props.sync.offline,
        pending: props.sync.pending,
        error: props.sync.state === 'error',
        otherDevice: props.sync.otherDeviceName,
      })}
      syncVerb={settingsCopy.syncVerb({
        on: props.sync.state === 'on',
        error: props.sync.state === 'error',
      })}
      onOpenSync={props.onOpenSync}
      appearance={props.appearance}
      onPickAppearance={props.setAppearance}
      appearanceNote={settingsCopy.appearance(props.appearance)}
      sunOn={props.sunOn}
      onToggleSun={() => props.setSunOn(!props.sunOn)}
      icon={props.icon}
      onPickIcon={props.setIcon}
      micLine={settingsCopy.microphone(permission)}
      micDenied={permission === 'denied'}
      onOpenSystemSettings={props.services.openSystemSettings}
      onSeeWidget={props.onSeeWidget}
      analyticsOn={props.analyticsOn}
      onToggleAnalytics={() => props.setAnalyticsOn(!props.analyticsOn)}
      privacyOpen={props.privacyOpen}
      onTogglePrivacy={() => props.setPrivacyOpen(!props.privacyOpen)}
      hasAccount={props.sync.state === 'on' || props.sync.state === 'error'}
      onOpenDelete={() => props.setPage('delete')}
      onOpenManifesto={() => props.setPage('manifesto')}
      version={props.services.update.version}
      updateLine={
        props.services.update.soft
          ? `${props.services.update.version} is in the app store`
          : 'up to date'
      }
      deleteArmed={props.deleteArmed}
      onDeleteStep={() => {
        if (!props.deleteArmed) {
          props.setDeleteArmed(true);
          return;
        }
        // The account deletion itself is the existing v1 path; the two-step confirm in front
        // of it is what changes.
        props.setDeleteArmed(false);
        props.setPage('root');
      }}
    />
  );
}

/** The widget preview, showing the record's actual last line rather than a placeholder. */
function WidgetLive({
  store,
  onClose,
  onCapture,
}: {
  store: RecordStore;
  onClose: () => void;
  onCapture: () => void;
}) {
  const [last, setLast] = useState<Material | null>(null);
  useEffect(() => {
    void store.loadRecord(1).then((rows) => setLast(rows[0] ?? null));
  }, [store]);

  const now = Date.now();
  return (
    <WidgetPreview
      lastLine={last ? firstLine(last) : 'nothing yet'}
      lastWhen={
        last ? (dayLabel(last.at, now) === 'today' ? fmtTime(last.at) : dayLabel(last.at, now)) : ''
      }
      onCapture={onCapture}
      onSpeak={onCapture}
      onClose={onClose}
    />
  );
}
