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
import { Linking, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import Constants from 'expo-constants';
import { useIncomingShare } from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { ChinottoApp, type Services } from './record/ChinottoApp';
import { ensureThisDevice } from './record/devices';
import { SURFACE } from './record/ui/tokens';
import type { VoiceEngine } from './record/voice';
import {
  startVoiceCapture,
  stopVoiceCapture,
  subscribeVoiceCapture,
} from './src/features/voiceCapture/NativeVoiceCapture';
import { getDatabase } from './storage/db';
import { getRuntimeAppVersion, useAppUpdateCheck } from './src/services/appUpdate/useAppUpdateCheck';
import {
  getCurrentAppIconVariantId,
  setCurrentAppIconVariantId,
} from './src/services/icons/appIcon';
import { parseWidgetDeepLink } from './widgets/parseWidgetDeepLink';
import { isFirebaseSyncConfigured } from './sync/firebaseConfig';
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

/** The native module, behind the narrow interface `record/voice.ts` asks for. */
const voiceEngine: VoiceEngine = {
  start: (options) => startVoiceCapture({ continuous: true, audioFileName: options.audioFileName }),
  stop: () => stopVoiceCapture(),
  subscribe: (handlers) => subscribeVoiceCapture(handlers),
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
  const handledShare = useRef(false);
  const [shareSeen, setShareSeen] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      // `getDatabase` runs the ladder. Nothing renders before it resolves, because a
      // surface drawn against the wrong schema would be worse than a blank field.
      const opened = await getDatabase();
      if (!alive) return;
      setDb(opened);
      await ensureThisDevice(opened as unknown as RecordDb, {
        newId: randomUUID,
        deviceName: () => deviceName(),
        now: Date.now,
      });
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

      microphonePermission: () => micPermission,
      // Asking IS holding the circle: iOS raises the prompt on the first attempt, so there
      // is nothing separate to request.
      requestMicrophonePermission: () => {},

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
        devices: async () => null,
        thisDeviceId: () => null,
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
  ]);

  // The ink field, from the first frame, so there is never a white flash before the record.
  if (!services) return <View style={{ flex: 1, backgroundColor: SURFACE }} />;

  return <ChinottoApp services={services} />;
}
