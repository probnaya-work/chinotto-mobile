/**
 * Turning sync on, and off.
 *
 * This is the shipping app's own sequence, kept intact and moved behind the new sheet. It
 * is not a redesign of the purchase or the account: the product identifiers, the entitlement
 * name, the order of the work after signing in, and what each outcome means are all exactly
 * as `components/useEnableSyncController.ts` has them, because they describe App Store and
 * Firebase behaviour rather than a preference.
 *
 * What is new is only what the surface is allowed to say while it happens. Three rules:
 *
 *   * **a cancel is not an error.** Somebody deciding not to buy something is not a failure,
 *     and does not get a red sentence;
 *   * **nothing claims to have worked until it has.** `on` means signed in, not "the button
 *     was pressed";
 *   * **the record never waits for any of it.** Capture is local and free throughout; this
 *     whole module can fail and the only thing that stops working is sync.
 *
 * Every platform call is injected, so the sequence — which is the part that can silently go
 * wrong — is exercised without a store, an Apple ID or a network.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { defaultPlan, planCta, planRows, type PlanRow } from './paywall';
import type { ChinottoPackageKind } from '../src/services/purchases/constants';
import type { ChinottoPaywallPackage } from '../src/services/purchases/offerings';
import type { SyncPurchaseFlowResult } from '../monetization/syncPurchaseFlow';

/** What turning sync on needs from the platform, and nothing else. */
export type SyncAccountPorts = {
  /** Whether this build charges for sync at all. */
  paywallEnabled: () => boolean;
  /** RevenueCat entitlement, local trial or legacy flag — the cached answer. */
  hasSyncAccess: () => boolean;
  /** Null when the offering could not be read; an empty list when there is nothing to sell. */
  loadPlans: () => Promise<ChinottoPaywallPackage[] | null>;
  purchase: (
    kind: ChinottoPackageKind,
    preloaded: ChinottoPaywallPackage[]
  ) => Promise<SyncPurchaseFlowResult>;
  /** `reached` is false when the store could not be asked at all. */
  restore: () => Promise<{ hasAccess: boolean; reached: boolean }>;
  /** Resolves `cancelled` when somebody backed out of the Apple sheet. */
  signInWithApple: () => Promise<'signed-in' | 'cancelled'>;
  /** The queue, the outboxes, the theme backfill and the access mirror — in that order. */
  afterSignIn: () => Promise<void>;
  mirrorAccess: (options?: { forceInactive?: boolean }) => Promise<void>;
  signOut: () => Promise<void>;
};

/** Where the sheet is in turning sync on. `idle` means it is not in the middle of anything. */
export type AccountPhase = 'idle' | 'plan' | 'apple' | 'connecting';

export type SyncAccountState = ReturnType<typeof useSyncAccount>;

export function useSyncAccount(ports: SyncAccountPorts, onEnabled: () => void) {
  const [phase, setPhase] = useState<AccountPhase>('idle');
  const [plans, setPlans] = useState<ChinottoPaywallPackage[]>([]);
  const [plansUnavailable, setPlansUnavailable] = useState(false);
  const [chosen, setChosen] = useState<ChinottoPackageKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justEnabled, setJustEnabled] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const rows: PlanRow[] = planRows(plans);

  /** Past the paywall, the only thing left is who you are. */
  const toApple = useCallback(() => setPhase('apple'), []);

  /**
   * Opening the sheet with sync off. Either there is something to buy first, or there is not.
   */
  const begin = useCallback(async () => {
    setError(null);
    setJustEnabled(false);

    if (!ports.paywallEnabled() || ports.hasSyncAccess()) {
      setPhase('apple');
      return;
    }

    setPhase('plan');
    setPlansUnavailable(false);
    const loaded = await ports.loadPlans();
    if (!alive.current) return;
    if (loaded == null) {
      setPlansUnavailable(true);
      return;
    }
    setPlans(loaded);
    setChosen((current) => current ?? defaultPlan(planRows(loaded)));
  }, [ports]);

  const leave = useCallback(() => {
    setPhase('idle');
    setError(null);
    setBusy(false);
    setJustEnabled(false);
  }, []);

  const continueWithPlan = useCallback(async () => {
    if (busy) return;
    const kind = chosen ?? defaultPlan(rows);
    if (!kind) return;

    setError(null);
    setBusy(true);
    try {
      const result = await ports.purchase(kind, plans);
      if (!alive.current) return;
      switch (result.kind) {
        case 'already_has_sync_access':
        case 'purchased':
          void ports.mirrorAccess();
          toApple();
          break;
        case 'purchased_without_entitlement':
          // The App Store took the money and the entitlement is not live yet. Saying so is
          // the only honest option: the purchase is real and sync is not on.
          void ports.mirrorAccess();
          setError(
            'the purchase went through, but sync access is not active yet · try restore, and if it persists the products are not attached to Chinotto Pro'
          );
          break;
        case 'cancelled':
          // Not an error. Nothing is said, and the plans stay where they were.
          break;
        case 'unavailable':
          setError('plans are not available right now');
          break;
        case 'failed':
          setError(result.error.message || 'something went wrong · try again');
          break;
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [busy, chosen, rows, plans, ports, toApple]);

  const restore = useCallback(async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const { hasAccess, reached } = await ports.restore();
      if (!alive.current) return;
      if (hasAccess) {
        void ports.mirrorAccess();
        toApple();
        return;
      }
      setError(
        reached
          ? 'no purchases found for this apple id'
          : 'could not reach the store · check the connection and try again'
      );
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [busy, ports, toApple]);

  const continueWithApple = useCallback(async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    setPhase('connecting');
    try {
      const outcome = await ports.signInWithApple();
      if (!alive.current) return;
      if (outcome === 'cancelled') {
        // Backing out of Apple's own sheet is not a failure; the sheet simply stays.
        setPhase('apple');
        return;
      }
      // Everything that was waiting goes now, in the order the shipping app sends it.
      await ports.afterSignIn();
      if (!alive.current) return;
      setPhase('idle');
      setJustEnabled(true);
      onEnabled();
    } catch (err: unknown) {
      if (!alive.current) return;
      setPhase('apple');
      setError(err instanceof Error && err.message ? err.message : 'could not sign in · try again');
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [busy, ports, onEnabled]);

  const stop = useCallback(async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      // Told first, so the record is marked inactive while there is still an identity to
      // mark it with. Signing out first would leave it claiming to be active forever.
      await ports.mirrorAccess({ forceInactive: true });
      await ports.signOut();
      if (!alive.current) return;
      setJustEnabled(false);
      setPhase('idle');
    } catch (err: unknown) {
      if (!alive.current) return;
      setError(
        err instanceof Error && err.message ? err.message : 'could not stop syncing · try again'
      );
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [busy, ports]);

  return {
    phase,
    busy,
    error,
    justEnabled,

    rows,
    plansUnavailable,
    chosen: chosen ?? defaultPlan(rows),
    pickPlan: setChosen,
    cta: planCta(rows, chosen ?? defaultPlan(rows)),

    begin,
    leave,
    continueWithPlan,
    restore,
    continueWithApple,
    stop,
  };
}
