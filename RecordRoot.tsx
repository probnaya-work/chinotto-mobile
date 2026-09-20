/**
 * The root of the Record.
 *
 * Wires the platform to `ChinottoApp`: opens the database through the migration ladder,
 * builds the services the app asks for, and renders nothing but the surface.
 *
 * Everything here is adapter work. The one rule it keeps is the app's own: **the record
 * renders as soon as the schema is ready, and nothing else is allowed in front of it.**
 * Fonts, sync, the legacy catch-up and the share extension all resolve behind the surface.
 *
 * The v1 `App.tsx` is deliberately still in the tree. Nothing imports it any more, but it
 * and the v1 stores it reads are what a revert goes back to, so they stay until the
 * desktop/mobile transition is over.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import Constants from 'expo-constants';
import { useIncomingShare } from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { ChinottoApp, type Services } from './record/ChinottoApp';
import { ensureThisDevice, HEARTBEAT_MS, isRevoked, type ThisDevice } from './record/devices';
import { SURFACE } from './record/ui/tokens';
import type { VoiceEngine } from './record/voice';
import {
  startVoiceCapture,
  stopVoiceCapture,
  subscribeVoiceCapture,
} from './src/features/voiceCapture/NativeVoiceCapture';
import type { AudioPlaybackPort } from './record/playback';
import {
  playAudio,
  stopAudio,
  subscribeAudioPlayback,
} from './src/features/audioPlayback/NativeAudioPlayback';
import { getDatabase } from './storage/db';
import { getRuntimeAppVersion, useAppUpdateCheck } from './src/services/appUpdate/useAppUpdateCheck';
import {
  getCurrentAppIconVariantId,
  setCurrentAppIconVariantId,
} from './src/services/icons/appIcon';
import { parseWidgetDeepLink } from './widgets/parseWidgetDeepLink';
import { isFirebaseSyncConfigured } from './sync/firebaseConfig';
import { resolvePushEntryForSync } from './sync/pushEntryForSync';
import { startBackgroundSync } from './sync/syncEngine';
import { signOut as firebaseSignOut } from 'firebase/auth';

import {
  getCachedHasSyncEntitlement,
  loadSubscriptionState,
} from './monetization/subscriptionState';
import { isPaywallEnabled } from './monetization/paywallConfig';
import { openSyncPurchaseFlow } from './monetization/syncPurchaseFlow';
import { AppleUserCanceledError, enableAppleSyncWithFirebase } from './auth/enableAppleSync';
import { loadCurrentChinottoOffering } from './src/services/purchases/offerings';
import { restorePurchases } from './src/services/purchases/revenueCat';
import { processSyncQueue } from './sync/syncEngine';
import { flushSyncTombstoneOutbox } from './sync/tombstoneFlush';
import { flushSyncUserThemeOutbox } from './sync/userThemeFlush';
import { backfillLocalThemesToRemote } from './sync/themeSyncBackfill';
import { mirrorChinottoSyncAccessToFirestore } from './sync/firestoreSyncAccessMirror';
import {
  announceThisDevice,
  listCloudDevices,
  revokeCloudDevice,
} from './sync/firestoreDevices';
import { setThisDeviceRevoked } from './sync/deviceRevocation';
import {
  AccountDeletionNeedsRecentLogin,
  deleteChinottoAccountForCurrentUser,
  resumeChinottoAccountDeletionAfterReauth,
} from './sync/deleteChinottoAccount';
import { AppleUserCanceledError as AppleReauthCanceled } from './auth/appleSignInCredential';
import type { SyncAccountPorts } from './record/useSyncAccount';
import { bootstrapRevenueCat } from './src/services/purchases/initRevenueCat';
import { getOrInitAuth } from './sync/firebaseAuth';
import { isSyncAccessBlocked } from './monetization/syncAccessPolicy';
import { insertPendingSyncItem, removePendingSyncItemsForEntry } from './sync/syncQueue';
import { enqueueSyncTombstoneWithDb } from './sync/tombstoneOutbox';
import { addFirestoreIngestSuppressionWithDb } from './sync/ingestSuppression';
import type { RecordDb } from './record/db';

const APP_VERSION = getRuntimeAppVersion();

/**
 * What this device calls itself, for the device list.
 *
 * `deviceName` is what somebody will recognise in a list of two — "Aleks's iPhone" rather
 * than a UUID. When the platform will not say, the honest fallback is the generic noun, not
 * an invented name.
 */
const deviceName = (): string =>
  (Constants.deviceName as string | undefined)?.trim() || 'this iphone';

/**
 * Turning sync on and off, as the shipping app does it.
 *
 * Module-level and stable, so nothing that holds a flow in progress is rebuilt underneath
 * it. Each one is the production call it has always been — the sequence after signing in is
 * the same sequence, in the same order, because it describes what the backend expects
 * rather than what this surface prefers.
 */
const syncAccount: SyncAccountPorts = {
  paywallEnabled: () => isPaywallEnabled(),
  hasSyncAccess: () => getCachedHasSyncEntitlement(),

  loadPlans: async () => {
    const offering = await loadCurrentChinottoOffering();
    // `null` means the offering could not be read at all, which is different from an
    // offering that exists and sells nothing.
    return offering.ok ? offering.packages : null;
  },

  purchase: (kind, preloaded) =>
    openSyncPurchaseFlow({
      packageKind: kind,
      ...(preloaded.length > 0 ? { preloadedPackages: preloaded } : {}),
    }),

  restore: async () => {
    const info = await restorePurchases();
    // A null `info` means the store was never reached; an entitlement that is still absent
    // after a successful call means there was genuinely nothing to restore.
    return { hasAccess: getCachedHasSyncEntitlement(), reached: info != null };
  },

  signInWithApple: async () => {
    try {
      await enableAppleSyncWithFirebase();
      return 'signed-in';
    } catch (err) {
      if (err instanceof AppleUserCanceledError) return 'cancelled';
      throw err;
    }
  },

  afterSignIn: async () => {
    await processSyncQueue(resolvePushEntryForSync());
    await flushSyncTombstoneOutbox();
    await flushSyncUserThemeOutbox();
    await backfillLocalThemesToRemote();
    await mirrorChinottoSyncAccessToFirestore();
  },

  mirrorAccess: (options) => mirrorChinottoSyncAccessToFirestore(options),
  signOut: () => firebaseSignOut(getOrInitAuth()),
};

/**
 * Deleting the cloud account.
 *
 * Firebase will refuse to delete a user whose sign-in is not recent, and it does so **after**
 * the Firestore data has already been cleared — so the reauthentication is not optional and
 * the second half is not a retry, it is a resumption. Backing out of Apple's sheet at that
 * point leaves the account itself in place, which is why `cancelled` is a distinct answer
 * rather than an error.
 */
async function deleteCloudAccount(): Promise<'deleted' | 'cancelled'> {
  try {
    await deleteChinottoAccountForCurrentUser();
    return 'deleted';
  } catch (err) {
    if (!(err instanceof AccountDeletionNeedsRecentLogin)) throw err;
    try {
      await resumeChinottoAccountDeletionAfterReauth();
      return 'deleted';
    } catch (again) {
      if (again instanceof AppleReauthCanceled) return 'cancelled';
      throw again;
    }
  }
}

/** The native module, behind the narrow interface `record/voice.ts` asks for. */
const voiceEngine: VoiceEngine = {
  start: (options) => startVoiceCapture({ continuous: true, audioFileName: options.audioFileName }),
  stop: () => stopVoiceCapture(),
  subscribe: (handlers) => subscribeVoiceCapture(handlers),
};

/**
 * Playing a moment back. A separate native module from the recorder on purpose: recording
 * is the load-bearing path, and nothing about hearing a recording again is allowed to
 * reach into it.
 */
const audioPlayback: AudioPlaybackPort = {
  play: (id, relativePath) => playAudio(id, relativePath),
  stop: () => stopAudio(),
  subscribe: (handlers) => subscribeAudioPlayback(handlers),
};

export default function RecordRoot() {
  const [db, setDb] = useState<SQLiteDatabase | null>(null);

  // The real gate, from remote config. `forced` is the one blocking surface the product
  // has, and it is not something to guess at: until this says otherwise, nothing is claimed.
  const { gate, dismissSoft } = useAppUpdateCheck({ enabled: true });

  const [icon, setIcon] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    void getCurrentAppIconVariantId().then(setIcon);
  }, []);
  const chooseIcon = useCallback((next: 'dark' | 'light') => {
    setIcon(next);
    void setCurrentAppIconVariantId(next);
  }, []);

  /**
   * Microphone state is only ever learned by trying.
   *
   * There is no API that reports the permission without asking for it, so settings says
   * "not asked yet" until a recording actually succeeds or is refused — and then says what
   * happened. It never claims to know an answer it has not been given. (Desktop reached the
   * same rule independently; their decision 12.6.)
   */
  /**
   * Whether the subscription state has been read at all.
   *
   * Not the same as "subscribed": until this is true nothing is known, and the sync surface
   * must not claim either way. It gates the paywall the same way it does in the shipping
   * app, so a plan sheet is never drawn against an unread entitlement.
   */
  /** This install's identity. Generated once, never regenerated — see `record/devices.ts`. */
  const [thisDevice, setThisDevice] = useState<ThisDevice | null>(null);

  /**
   * Saying this device is still here, once a minute.
   *
   * The heartbeat is what makes `last seen` a fact rather than a guess, and it is the only
   * thing that writes one. A device that never runs this is simply not listed.
   */
  useEffect(() => {
    if (!thisDevice) return;
    const beat = () =>
      void announceThisDevice({
        id: thisDevice.id,
        name: thisDevice.name,
        platform: Platform.OS === 'ios' ? 'iphone' : Platform.OS,
      });
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [thisDevice]);

  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      // Local flags first, so the gate is answerable offline; RevenueCat then corrects it.
      await loadSubscriptionState().catch(() => {});
      if (alive) setSubscriptionLoaded(true);
      await bootstrapRevenueCat().catch(() => {});
    })();
    return () => {
      alive = false;
    };
  }, []);

  /**
   * The outbox, emptied on a timer.
   *
   * Capture writes to the queue whether or not anything can send it, which is the point —
   * the record does not wait for a network. This is the other half: it drains when there is
   * one, and does nothing quietly when there is not.
   */
  useEffect(() => {
    if (!db) return;
    const handle = startBackgroundSync({ pushEntry: resolvePushEntryForSync() });
    return () => handle.stop();
  }, [db]);

  const [micPermission, setMicPermission] = useState<'granted' | 'ask' | 'denied'>('ask');
  useEffect(
    () =>
      subscribeVoiceCapture({
        onStateChange: (state) => {
          if (state === 'listening') setMicPermission('granted');
        },
        onError: (code) => {
          if (code === 'permission_denied') setMicPermission('denied');
        },
      }),
    []
  );

  /** The widget and the scheme both mean one thing: put the caret in the field. */
  const [voiceOnOpen, setVoiceOnOpen] = useState(false);
  useEffect(() => {
    const handle = (url: string | null) => {
      const action = parseWidgetDeepLink(url);
      if (action?.type === 'capture' && action.mode === 'voice') setVoiceOnOpen(true);
    };
    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);
  const { resolvedSharedPayloads, sharedPayloads, clearSharedPayloads } = useIncomingShare();
  // Resolved payloads carry the title and the selection; the raw ones are the fallback when
  // resolution failed or returned nothing.
  const sharePayloads =
    resolvedSharedPayloads?.length ? resolvedSharedPayloads : sharedPayloads;
  /**
   * Whether the share currently in hand has already been taken.
   *
   * It has to be reset, and used not to be: once true it stayed true for the life of the
   * process, so the *second* thing shared into a running Chinotto was dropped without a
   * word. The reset is the payloads going empty, which is what `clearSharedPayloads` does
   * after one is taken — so the next arrival is a new arrival.
   */
  const handledShare = useRef(false);
  const [shareSeen, setShareSeen] = useState(0);

  useEffect(() => {
    if (!sharePayloads || sharePayloads.length === 0) handledShare.current = false;
  }, [sharePayloads]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      // `getDatabase` runs the ladder. Nothing renders before it resolves, because a
      // surface drawn against the wrong schema would be worse than a blank field.
      const opened = await getDatabase();
      if (!alive) return;
      setDb(opened);
      const registered = await ensureThisDevice(opened as unknown as RecordDb, {
        newId: randomUUID,
        deviceName: () => deviceName(),
        now: Date.now,
      });
      if (alive) setThisDevice(registered);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const services: Services | null = useMemo(() => {
    if (!db) return null;
    const asRecordDb = db as unknown as RecordDb;
    const configured = isFirebaseSyncConfigured();

    return {
      db: asRecordDb,
      voiceEngine,
      newId: randomUUID,
      deviceName: () => deviceName(),

      update: {
        soft: gate?.kind === 'soft',
        forced: gate?.kind === 'forced',
        version: APP_VERSION,
      },
      onDismissSoftUpdate: dismissSoft,
      openStore: () => {
        const url = gate?.storeUrl;
        if (url) void Linking.openURL(url);
      },
      openSystemSettings: () => void Linking.openSettings(),

      // Asking IS holding the circle: the native side raises both prompts on its first
      // attempt, so there is nothing separate to request — and nothing separate that could
      // quietly become a stub while the surface waited on it.
      microphonePermission: () => micPermission,
      subscriptionLoaded,
      syncAccount,
      deleteAccount: deleteCloudAccount,
      revokeDevice: revokeCloudDevice,
      audio: audioPlayback,

      icon,
      onPickIcon: chooseIcon,
      voiceOnOpen,
      onVoiceOnOpenHandled: () => setVoiceOnOpen(false),

      incomingShare: handledShare.current ? null : (sharePayloads ?? null),
      onShareHandled: () => {
        handledShare.current = true;
        clearSharedPayloads?.();
        setShareSeen((n) => n + 1);
      },

      syncPorts: {
        configured: () => configured,
        currentUserId: () => (configured ? (getOrInitAuth().currentUser?.uid ?? null) : null),
        blockedByPaywall: () => isSyncAccessBlocked(),
        // Connectivity is genuinely unknown without a reachability check, and "unknown" is
        // not "offline". The surface draws nothing rather than claiming either.
        online: () => null,
        pendingCount: async () => {
          const row = await asRecordDb.getFirstAsync<{ n: number }>(
            "SELECT COUNT(*) AS n FROM sync_queue WHERE status = 'pending'"
          );
          return row?.n ?? 0;
        },
        // No device collection is being read yet, so no device list is drawn. A fabricated
        // row with a fabricated last-seen would be worse than an honest absence.
        devices: async () => {
          const rows = await listCloudDevices();
          // Reading the list is also how this device learns it has been removed. Nothing
          // else tells it, and it must stop sending rather than wait to be told twice.
          if (rows && thisDevice) setThisDeviceRevoked(isRevoked(rows, thisDevice.id));
          return rows;
        },
        thisDeviceId: () => thisDevice?.id ?? null,
        signInExpired: () => false,
        signInExpiredWhen: () => null,
      },

      legacy: configured
        ? {
            enqueue: async (_d, entry) => {
              await insertPendingSyncItem(db, entry);
            },
            dequeue: async (_d, id) => {
              await removePendingSyncItemsForEntry(db, id);
            },
            tombstone: async (_d, id) => {
              await addFirestoreIngestSuppressionWithDb(db, id);
              await enqueueSyncTombstoneWithDb(db, id);
            },
          }
        : undefined,
    };
    // `shareSeen` is in the deps so the payload clears once it has been taken.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    db,
    sharePayloads,
    shareSeen,
    gate,
    dismissSoft,
    icon,
    chooseIcon,
    voiceOnOpen,
    micPermission,
    subscriptionLoaded,
    thisDevice,
  ]);

  // The ink field, from the first frame, so there is never a white flash before the record.
  if (!services) return <View style={{ flex: 1, backgroundColor: SURFACE }} />;

  return <ChinottoApp services={services} />;
}
