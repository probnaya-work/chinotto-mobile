/**
 * What the sync surface is allowed to say.
 *
 * This is a reading of the existing sync layer, not a rewrite of it. The transport — the
 * queue, the tombstone outbox, ingest suppression, entitlement — is sound and untouched;
 * what changes is what travels over it and what the interface claims about it.
 *
 * The rule the whole module exists to keep: **never say something that is not known.** A
 * device list with nothing behind it, a "last seen a moment ago" for a device that has never
 * checked in, or "everything is up to date" while an outbox is full are all worse than
 * saying less. Where this cannot know, it reports `null` and the surface draws nothing.
 */

import { useCallback, useEffect, useState } from 'react';

import { isRevoked, visibleDevices, type RemoteDevice } from './devices';
import type { SyncState, WordingConflict } from './ui/SyncSheet';
import { lastSeenLabel } from './ui/SyncSheet';
import type { RecordBridge } from './bridge';
import { fmtTime } from './model/time';

/** Everything the platform must tell us. Injected, so the surface is testable without it. */
export type SyncPorts = {
  /** False when Firebase is not configured in this build at all. */
  configured: () => boolean;
  /** Null when nobody is signed in. */
  currentUserId: () => string | null;
  /** True when the subscription does not currently allow sync. */
  blockedByPaywall: () => boolean;
  /** Null when connectivity is unknown — which is different from being offline. */
  online: () => boolean | null;
  /** How much is waiting in the outbox. */
  pendingCount: () => Promise<number>;
  /** The devices the cloud knows about, or null when it has not been read yet. */
  devices: () => Promise<RemoteDevice[] | null>;
  thisDeviceId: () => string | null;
  /** True when the last attempt failed because the sign-in expired. */
  signInExpired: () => boolean;
  signInExpiredWhen: () => number | null;
};

export type SyncSurface = ReturnType<typeof useSyncSurface>;

export function useSyncSurface(
  ports: SyncPorts,
  bridge: RecordBridge,
  nowFn = Date.now
) {
  const [pending, setPending] = useState(0);
  const [devices, setDevices] = useState<RemoteDevice[] | null>(null);
  const [conflict, setConflict] = useState<WordingConflict | null>(null);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<'device' | 'stop' | null>(null);
  const [confirmingDeviceId, setConfirmingDeviceId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** Said only when a removal genuinely did not happen. */
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setPending(await ports.pendingCount());
    setDevices(await ports.devices());

    const open = await bridge.openConflicts();
    const first = open[0];
    setConflict(
      first
        ? {
            fragmentId: first.fragmentId,
            localText: first.localText,
            remoteText: first.remoteText,
            // Which wording is *later* is unknown over the legacy contract, so the labels
            // say where each one is, not when it was written. Anything else would be a
            // claim the data cannot support.
            localLabel: `this iphone · ${fmtTime(first.noticedAt)}`,
            remoteLabel: 'your other device',
            shows: first.shows,
          }
        : null
    );
  }, [ports, bridge]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const configured = ports.configured();
  const signedIn = ports.currentUserId() !== null;
  const expired = ports.signInExpired();
  const online = ports.online();
  const offline = online === false;
  const thisDeviceId = ports.thisDeviceId();

  const state: SyncState = !configured || !signedIn
    ? 'off'
    : expired
      ? 'error'
      : 'on';

  const revoked = devices && thisDeviceId ? isRevoked(devices, thisDeviceId) : false;

  const listed = devices && thisDeviceId ? visibleDevices(devices, thisDeviceId) : [];
  const shown = listed.map((d) => ({
    id: d.id,
    name: d.name,
    lastSeen: lastSeenLabel(d.lastSeenAt, nowFn()) ?? '',
    isThisDevice: d.id === thisDeviceId,
  }));

  const otherDeviceName = shown.find((d) => !d.isThisDevice)?.name ?? null;

  /**
   * The quiet notice at the edge.
   *
   * Only three things are ever worth interrupting for, and none of them is "working
   * normally". When sync is on and nothing is wrong, this is null and the edge stays quiet.
   */
  const notice: { text: string; urgent: boolean } | null = conflict
    ? { text: 'one moment was worded twice · both kept', urgent: false }
    : state === 'error'
      ? { text: 'sync stopped · sign in again', urgent: true }
      : revoked
        ? { text: 'this phone was removed from the record · it stays here', urgent: false }
        : state === 'on' && offline && pending > 0
          ? { text: `offline · ${pending} waiting`, urgent: false }
          : null;

  return {
    open,
    setOpen,
    state,
    offline,
    pending,
    revoked,
    devices: shown,
    otherDeviceName,
    conflict,
    notice,
    confirming,
    confirmingDeviceName:
      shown.find((d) => d.id === confirmingDeviceId)?.name ?? null,

    refresh,
    blockedByPaywall: ports.blockedByPaywall(),
    errorWhen: (() => {
      const at = ports.signInExpiredWhen();
      return at ? fmtTime(at) : 'recently';
    })(),

    deviceError,

    askRemoveDevice: (id: string) => {
      setDeviceError(null);
      setConfirmingDeviceId(id);
      setConfirming('device');
    },

    /**
     * Removes the device the sheet is asking about.
     *
     * The row leaves the list only when the cloud says it has been revoked. A removal that
     * failed leaves the device exactly where it was and says so — a list that quietly drops
     * a row while the device goes on syncing would be the worst kind of wrong here.
     */
    removeConfirmedDevice: async (revoke: (id: string) => Promise<boolean>) => {
      const id = confirmingDeviceId;
      setConfirming(null);
      setConfirmingDeviceId(null);
      if (!id) return;
      const done = await revoke(id);
      if (!done) {
        setDeviceError('could not remove that device · it is still syncing');
        return;
      }
      setDeviceError(null);
      await refresh();
    },
    askStop: () => setConfirming('stop'),
    cancelConfirm: () => {
      setConfirming(null);
      setConfirmingDeviceId(null);
    },

    copied,
    markCopied: () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },

    /** `show this one instead` — a correction like any other, so the other wording is kept. */
    keepWording: async (which: 'local' | 'remote', correct: (id: string, body: string) => Promise<unknown>) => {
      if (!conflict) return;
      await bridge.resolveConflict(conflict.fragmentId, which, correct);
      await refresh();
    },
    settleConflict: async (correct: (id: string, body: string) => Promise<unknown>) => {
      if (!conflict) return;
      await bridge.resolveConflict(conflict.fragmentId, conflict.shows, correct);
      await refresh();
    },
  };
}
