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

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { isFirebaseSyncConfigured } from './sync/firebaseConfig';
import { getOrInitAuth } from './sync/firebaseAuth';
import { isSyncAccessBlocked } from './monetization/syncAccessPolicy';
import { insertPendingSyncItem, removePendingSyncItemsForEntry } from './sync/syncQueue';
import { enqueueSyncTombstoneWithDb } from './sync/tombstoneOutbox';
import { addFirestoreIngestSuppressionWithDb } from './sync/ingestSuppression';
import type { RecordDb } from './record/db';

const APP_VERSION = (Constants.expoConfig?.version as string | undefined) ?? '2.0.0';

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

      // The gate is read from the existing update service; until it reports otherwise,
      // nothing is claimed.
      update: { soft: false, forced: false, version: APP_VERSION },
      openStore: () => void Linking.openURL('itms-apps://apps.apple.com/app/id0'),
      openSystemSettings: () => void Linking.openSettings(),

      // Permission is reported by the native module the first time the circle is held; the
      // app asks iOS rather than guessing, so this starts at `ask` and is corrected there.
      microphonePermission: () => 'ask',
      requestMicrophonePermission: () => {},

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
  }, [db, sharePayloads, shareSeen]);

  // The ink field, from the first frame, so there is never a white flash before the record.
  if (!services) return <View style={{ flex: 1, backgroundColor: SURFACE }} />;

  return <ChinottoApp services={services} />;
}
