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
import * as SplashScreen from 'expo-splash-screen';

import { RecordApp } from './RecordApp';
import { Settings, settingsCopy, type SettingsPage } from './ui/Settings';
import { ShareSurface, metBeforeLabel } from './ui/ShareSurface';
import { SyncSheet } from './ui/SyncSheet';
import { ForcedUpdate, WidgetPreview } from './ui/WidgetPreview';
import { FONT_ASSETS } from './ui/type';
import { SURFACE } from './ui/tokens';
import { createBridge, type RecordBridge } from './bridge';
import type { AudioPlaybackPort } from './playback';
import { createRecordStore, type RecordStore } from './store';
import { createVoiceCapture, type VoiceEngine } from './voice';
import { readShare, type ShareIntake, type SharePayloadLike } from './share';
import { useSyncSurface, type SyncPorts } from './useSyncSurface';
import { initAnalyticsOptIn, isOptIn, setOptIn, setUmami } from '../analytics/analytics';
import { useSyncDeepLink } from '../linking/useSyncDeepLink';
import { isFirebaseSyncConfigured } from '../sync/firebaseConfig';
import { useSyncAccount, type SyncAccountPorts } from './useSyncAccount';
import type { ChinottoPackageKind } from '../src/services/purchases/constants';
import { shouldRunMobileFirestoreIngest } from '../sync/ingestGate';
import { startMobileFirestoreIngest } from '../sync/firestoreIngest';
import {
  createDebouncedRemoteIngestNotifier,
  REMOTE_INGEST_AFTER_SYNC_MODAL_MS,
} from '../sync/remoteIngestStreamNotify';
import { refreshWidgetThoughtsFromLocalDb } from '../widgets/widgetThoughtsBridge';
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
  onDismissSoftUpdate: () => void;
  openStore: () => void;

  /** The home-screen icon, which is a real system setting rather than a preference. */
  icon: 'dark' | 'light';
  onPickIcon: (icon: 'dark' | 'light') => void;

  /** The widget's `mode=voice` deep link: open listening rather than typing. */
  voiceOnOpen: boolean;
  onVoiceOnOpenHandled: () => void;
  openSystemSettings: () => void;
  microphonePermission: () => 'granted' | 'ask' | 'denied';
  /** False until the entitlement has been read at all — which is not the same as unsubscribed. */
  subscriptionLoaded: boolean;
  /** Turning sync on and off: the store, Apple, and the work that follows signing in. */
  syncAccount: SyncAccountPorts;
  /** Deletes the cloud copy and the account behind it. `cancelled` when Apple was dismissed. */
  deleteAccount: () => Promise<'deleted' | 'cancelled'>;
  /** Removes another device from the record. False when it did not happen. */
  revokeDevice: (deviceId: string) => Promise<boolean>;
  /** Playing retained audio back. Omitted where the platform cannot, and then it is not offered. */
  audio?: AudioPlaybackPort;
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
  /**
   * Off until storage says otherwise, and off for good if storage cannot be read.
   *
   * The preference is the analytics module's own, not a second copy kept here — a toggle
   * that remembered a different answer from the thing it governs would be the worst of both.
   */
  const [analyticsOn, setAnalyticsOn] = useState(false);
  useEffect(() => {
    setUmami(
      process.env.EXPO_PUBLIC_UMAMI_URL?.trim() || null,
      process.env.EXPO_PUBLIC_UMAMI_WEBSITE_ID?.trim() || null
    );
    let alive = true;
    void initAnalyticsOptIn().then((on) => {
      if (alive) setAnalyticsOn(on);
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggleAnalytics = useCallback(() => {
    const next = !isOptIn();
    setOptIn(next);
    setAnalyticsOn(next);
  }, []);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  const [recording, setRecording] = useState<{ seconds: number; transcript: string } | null>(null);
  const recordingStartedAt = useRef(0);

  /**
   * Bumped whenever anything in the record changes, so the surface can read it again.
   *
   * Typed capture reloads itself, because it is the surface that did it. Nothing else is:
   * a voice capture settles in `record/voice.ts`, a share lands in the intake, and both
   * used to write a moment the record went on not showing until the app was restarted.
   * `onChanged` is the one place every write already passes through.
   */
  const [changedAt, setChangedAt] = useState(0);

  const store: RecordStore = useMemo(
    () =>
      createRecordStore(services.db, {
        newId: services.newId,
        onChanged: (id) => {
          void bridge.mirrorFragment(id);
          setChangedAt((n) => n + 1);
        },
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

  /**
   * The voice controller holds the recording that is currently happening — the id the file
   * was opened under, and the path it is being written to. It must therefore outlive
   * anything that is not a new database.
   *
   * It used to be rebuilt whenever `bridge` was, and `bridge` is rebuilt whenever the
   * services object is — which happens the moment the microphone permission becomes known.
   * That moment is the start of the first recording of every launch. So the controller was
   * replaced underneath the recording it was holding, the replacement had no pending id,
   * and when the audio finished it settled into nothing: a file on disk, and no moment.
   *
   * `bridge` is reached lazily instead, the same way `onChanged` above reaches it, because
   * it cannot be called before there is something to mirror.
   */
  const voice = useMemo(
    () =>
      createVoiceCapture({
        store,
        engine: services.voiceEngine,
        newId: services.newId,
        onCaptured: (m) => void bridge.mirrorFragment(m.id),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, services.voiceEngine, services.newId]
  );

  const sync = useSyncSurface(services.syncPorts, bridge);
  const account = useSyncAccount(services.syncAccount, () => void sync.refresh());

  /**
   * Opening the sheet with sync off starts the flow; opening it when sync is on is just
   * looking at it. Closing always puts the flow away, so a half-finished purchase is not
   * waiting behind the sheet the next time it is opened.
   */
  const openSync = useCallback(() => {
    sync.setOpen(true);
    if (sync.state === 'off') void account.begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync.state, sync.setOpen, account.begin]);

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

  /**
   * The native splash comes down once the lockup is under it, and not before.
   *
   * `index.ts` holds it, because on its own it goes on the first JS frame — which is the
   * record with no fonts and no lockup yet, a blank screen between the splash's mark and
   * the animation of the same mark.
   *
   * `fontsReady` is the moment there is something to hand over to: it is what gates the
   * lockup, and what the record's own type waits for. Two frames after it, the handover
   * has been painted and the splash can go.
   *
   * The timeout is not a nicety. A splash that never leaves is worse than the seam it was
   * covering, so if the fonts never settle it comes down anyway.
   */
  useEffect(() => {
    let done = false;
    const hide = () => {
      if (done) return;
      done = true;
      void SplashScreen.hideAsync().catch(() => {});
    };
    const bailout = setTimeout(hide, 4000);
    let second = 0;
    const first = requestAnimationFrame(() => {
      if (!fontsReady) return;
      second = requestAnimationFrame(hide);
    });
    return () => {
      clearTimeout(bailout);
      cancelAnimationFrame(first);
      if (second) cancelAnimationFrame(second);
    };
  }, [fontsReady]);

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

  /**
   * `chinotto://sync` — the link the desktop app shows as a QR when it wants this phone.
   *
   * The hook holds the intent until the record is actually up, so a link followed from a
   * cold start opens the sheet once the surface exists rather than into nothing. The
   * desktop session id travels with it and is stashed by the hook, which is what lets the
   * mac see the access mirror without being signed in yet.
   */
  useSyncDeepLink({
    enabled: Platform.OS === 'ios' && isFirebaseSyncConfigured(),
    phase: 'main',
    dbReady: true,
    subscriptionLoaded: services.subscriptionLoaded,
    onSyncDeepLink: () => openSync(),
  });

  /* ------------------------------------------------------------------ incoming */

  /**
   * What other devices send, brought into the Record.
   *
   * Ingest writes into `entries`, because that is the protocol the deployed Firestore
   * contract and the desktop bridge both speak; `projectCatchUp` is what carries it across.
   * Without this the phone could send and never receive, which is half a sync.
   *
   * Paused while the sync sheet is open, as in the shipping app: material arriving under
   * somebody's hands while they are deciding whether to turn sync on is a surface moving
   * for reasons they cannot see.
   */
  useEffect(() => {
    if (
      !shouldRunMobileFirestoreIngest({
        dbReady: true,
        subscriptionLoaded: services.subscriptionLoaded,
        syncModalVisible: sync.open,
      })
    ) {
      return;
    }

    let stop: (() => void) | undefined;
    const notifier = createDebouncedRemoteIngestNotifier(() => {
      void (async () => {
        const { created, conflicts } = await bridge.projectCatchUp();
        // Only disturb the surface when something actually arrived.
        if (created > 0 || conflicts > 0) setChangedAt((n) => n + 1);
      })();
    });

    // Attached after the sheet's dismissal has finished, so the record does not move while
    // it is still animating away.
    const attach = setTimeout(() => {
      stop = startMobileFirestoreIngest(() => notifier.notify());
    }, REMOTE_INGEST_AFTER_SYNC_MODAL_MS);

    return () => {
      clearTimeout(attach);
      notifier.flush();
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services.subscriptionLoaded, sync.open, bridge]);

  /**
   * The home widget shows the last few thoughts, and reads them from the legacy table the
   * bridge already keeps current. So it is refreshed whenever the record changes, rather
   * than being given a second source that could disagree with the first.
   */
  useEffect(() => {
    void refreshWidgetThoughtsFromLocalDb().catch(() => {});
  }, [changedAt]);

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

  /**
   * The widget's circle opens the app already listening. Held until the fonts are up so the
   * first frame is not a half-drawn surface behind a recording.
   */
  useEffect(() => {
    if (!services.voiceOnOpen || !fontsReady) return;
    services.onVoiceOnOpenHandled();
    const id = setTimeout(() => void startVoice(), 320);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services.voiceOnOpen, fontsReady]);

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
          openSystemSettings: services.openSystemSettings,
        }}
        audio={services.audio}
        changedAt={changedAt}
        sync={{ notice: sync.notice, onOpen: openSync }}
        update={{
          soft: services.update.soft && !updateDismissed,
          onUpdate: () => {
            setUpdateDismissed(true);
            services.openStore();
          },
          onLater: () => {
            setUpdateDismissed(true);
            services.onDismissSoftUpdate();
          },
        }}
      />

      {surface.kind === 'settings' ? (
        <SettingsSurface
          page={surface.page}
          setPage={(page) => setSurface({ kind: 'settings', page })}
          onClose={() => setSurface({ kind: 'record' })}
          onSeeWidget={() => setSurface({ kind: 'widget' })}
          onOpenSync={openSync}
          sync={sync}
          services={services}
          appearance={appearance}
          setAppearance={setAppearance}
          sunOn={sunOn}
          setSunOn={setSunOn}
          icon={services.icon}
          setIcon={services.onPickIcon}
          analyticsOn={analyticsOn}
          setAnalyticsOn={toggleAnalytics}
          privacyOpen={privacyOpen}
          setPrivacyOpen={setPrivacyOpen}
          deleteArmed={deleteArmed}
          setDeleteArmed={setDeleteArmed}
          deleteBusy={deleteBusy}
          deleteError={deleteError}
          onDelete={async () => {
            setDeleteError(null);
            setDeleteBusy(true);
            try {
              const what = await services.deleteAccount();
              if (what === 'deleted') {
                setDeleteArmed(false);
                setSurface({ kind: 'record' });
                await sync.refresh();
              }
            } catch (err) {
              setDeleteError(
                err instanceof Error && err.message
                  ? err.message
                  : 'could not delete the account · try again'
              );
            } finally {
              setDeleteBusy(false);
            }
          }}
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
          state={account.phase === 'idle' ? sync.state : account.phase}
          offline={sync.offline}
          pending={sync.pending}
          onClose={() => {
            sync.setOpen(false);
            sync.cancelConfirm();
            account.leave();
          }}
          plans={account.rows}
          chosenPlan={account.chosen ?? ''}
          onPickPlan={(id) => account.pickPlan(id as ChinottoPackageKind)}
          planCta={account.cta}
          onContinueWithPlan={() => void account.continueWithPlan()}
          onRestore={() => void account.restore()}
          errorMessage={
            account.error ??
            sync.deviceError ??
            (account.plansUnavailable ? 'plans could not be read right now' : null)
          }
          onContinueWithApple={() => void account.continueWithApple()}
          connectingLine="signing in…"
          devices={sync.devices}
          justEnabled={account.justEnabled}
          linkCopyLabel={sync.copied ? 'copied' : 'copy the link'}
          onCopyLink={sync.markCopied}
          confirming={sync.confirming}
          confirmingDeviceName={sync.confirmingDeviceName}
          onAskRemoveDevice={sync.askRemoveDevice}
          onRemoveDevice={() => void sync.removeConfirmedDevice(services.revokeDevice)}
          onAskStop={sync.askStop}
          onStop={() => {
            sync.cancelConfirm();
            void account.stop().then(() => sync.refresh());
          }}
          onCancelConfirm={sync.cancelConfirm}
          conflict={sync.conflict}
          onKeepWording={(which) => void sync.keepWording(which, store.correct)}
          onSettleConflict={() => void sync.settleConflict(store.correct)}
          onSignInAgain={() => void account.continueWithApple()}
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
  /** Flips the preference in the analytics module itself; the value shown follows it. */
  setAnalyticsOn: () => void;
  privacyOpen: boolean;
  setPrivacyOpen: (v: boolean) => void;
  deleteArmed: boolean;
  setDeleteArmed: (v: boolean) => void;
  deleteBusy: boolean;
  deleteError: string | null;
  onDelete: () => Promise<void>;
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
      onToggleAnalytics={props.setAnalyticsOn}
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
      deleteBusy={props.deleteBusy}
      deleteError={props.deleteError}
      onDeleteStep={() => {
        // Armed first, then done. The second press is the one that deletes, and it runs the
        // existing v1 path — Firestore, then the Firebase user, then the local sync state.
        if (!props.deleteArmed) {
          props.setDeleteArmed(true);
          return;
        }
        void props.onDelete();
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
