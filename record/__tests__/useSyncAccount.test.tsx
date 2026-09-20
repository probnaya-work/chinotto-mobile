/**
 * Turning sync on is the one sequence where being wrong costs money or an account.
 *
 * Every test here is a way the sheet could claim something that did not happen — sync on
 * after a cancel, a purchase treated as access it did not grant, an account signed out of
 * before the record was marked inactive — written down so it cannot.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useSyncAccount, type SyncAccountPorts } from '../useSyncAccount';
import type { ChinottoPaywallPackage } from '../../src/services/purchases/offerings';
import type { SyncPurchaseFlowResult } from '../../monetization/syncPurchaseFlow';

function pkg(kind: 'monthly' | 'yearly', price: string, perMonth?: number): ChinottoPaywallPackage {
  return {
    kind,
    storeProductId: kind,
    priceString: price,
    rcPackage: {
      product: {
        price: kind === 'yearly' ? 39.99 : 4.99,
        currencyCode: 'USD',
        pricePerMonth: perMonth ?? null,
      },
    },
  } as unknown as ChinottoPaywallPackage;
}

function ports(over: Partial<SyncAccountPorts> = {}) {
  const order: string[] = [];
  const base: SyncAccountPorts = {
    paywallEnabled: () => true,
    hasSyncAccess: () => false,
    loadPlans: async () => [pkg('monthly', '$4.99'), pkg('yearly', '$39.99', 3.33)],
    purchase: async () => ({ kind: 'purchased', productIdentifier: 'yearly' }),
    restore: async () => ({ hasAccess: false, reached: true }),
    signInWithApple: async () => {
      order.push('signIn');
      return 'signed-in';
    },
    afterSignIn: async () => {
      order.push('afterSignIn');
    },
    mirrorAccess: async () => {
      order.push('mirror');
    },
    signOut: async () => {
      order.push('signOut');
    },
    ...over,
  };
  return { ports: base, order };
}

const mount = (p: SyncAccountPorts, onEnabled = jest.fn()) =>
  renderHook(() => useSyncAccount(p, onEnabled));

describe('choosing a plan', () => {
  it('offers the year first, with the real price and the real saving', async () => {
    const { ports: p } = ports();
    const { result } = mount(p);

    await act(async () => {
      await result.current.begin();
    });

    expect(result.current.phase).toBe('plan');
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.rows[0]).toEqual({
      id: 'yearly',
      name: 'a year',
      price: '$39.99',
      note: 'save 33%',
    });
    expect(result.current.chosen).toBe('yearly');
    expect(result.current.cta).toBe('continue · $39.99 a year');
  });

  it('goes straight to who you are when there is nothing to sell', async () => {
    const { ports: p } = ports({ paywallEnabled: () => false });
    const { result } = mount(p);
    await act(async () => {
      await result.current.begin();
    });
    expect(result.current.phase).toBe('apple');
  });

  it('goes straight past the paywall for somebody who already has access', async () => {
    const { ports: p } = ports({ hasSyncAccess: () => true });
    const { result } = mount(p);
    await act(async () => {
      await result.current.begin();
    });
    expect(result.current.phase).toBe('apple');
  });

  it('says the plans could not be read, rather than showing none as if there were none', async () => {
    const { ports: p } = ports({ loadPlans: async () => null });
    const { result } = mount(p);
    await act(async () => {
      await result.current.begin();
    });
    expect(result.current.plansUnavailable).toBe(true);
    expect(result.current.rows).toEqual([]);
  });
});

describe('buying it', () => {
  it('moves on to signing in once the purchase is real', async () => {
    const { ports: p, order } = ports();
    const { result } = mount(p);
    await act(async () => {
      await result.current.begin();
    });
    await act(async () => {
      await result.current.continueWithPlan();
    });
    expect(result.current.phase).toBe('apple');
    expect(result.current.error).toBeNull();
    expect(order).toContain('mirror');
  });

  it('treats a cancel as a decision, not a failure', async () => {
    const purchase = jest.fn(async (): Promise<SyncPurchaseFlowResult> => ({ kind: 'cancelled' }));
    const { ports: p } = ports({ purchase });
    const { result } = mount(p);
    await act(async () => {
      await result.current.begin();
    });
    await act(async () => {
      await result.current.continueWithPlan();
    });
    // Still on the plans, and nothing red.
    expect(result.current.phase).toBe('plan');
    expect(result.current.error).toBeNull();
  });

  it('says so when the money went but the entitlement did not arrive', async () => {
    const { ports: p } = ports({
      purchase: async () => ({ kind: 'purchased_without_entitlement', productIdentifier: 'yearly' }),
    });
    const { result } = mount(p);
    await act(async () => {
      await result.current.begin();
    });
    await act(async () => {
      await result.current.continueWithPlan();
    });
    // Not moved on: sync is not on, and pretending otherwise would be the worst outcome here.
    expect(result.current.phase).toBe('plan');
    expect(result.current.error).toMatch(/not active yet/);
  });
});

describe('restoring', () => {
  it('moves on when the purchase was found', async () => {
    const { ports: p } = ports({ restore: async () => ({ hasAccess: true, reached: true }) });
    const { result } = mount(p);
    await act(async () => {
      await result.current.begin();
    });
    await act(async () => {
      await result.current.restore();
    });
    expect(result.current.phase).toBe('apple');
  });

  it('tells apart nothing to restore from not being able to ask', async () => {
    const { ports: p } = ports({ restore: async () => ({ hasAccess: false, reached: true }) });
    const { result } = mount(p);
    await act(async () => {
      await result.current.restore();
    });
    expect(result.current.error).toMatch(/no purchases found/);

    const { ports: q } = ports({ restore: async () => ({ hasAccess: false, reached: false }) });
    const { result: r2 } = mount(q);
    await act(async () => {
      await r2.current.restore();
    });
    expect(r2.current.error).toMatch(/could not reach the store/);
  });
});

describe('signing in', () => {
  it('sends everything that was waiting, in order, and only then says it is on', async () => {
    const onEnabled = jest.fn();
    const { ports: p, order } = ports();
    const { result } = mount(p, onEnabled);

    await act(async () => {
      await result.current.continueWithApple();
    });

    expect(order).toEqual(['signIn', 'afterSignIn']);
    expect(result.current.phase).toBe('idle');
    expect(result.current.justEnabled).toBe(true);
    expect(onEnabled).toHaveBeenCalledTimes(1);
  });

  it('says nothing at all when somebody backs out of apple', async () => {
    const onEnabled = jest.fn();
    const { ports: p } = ports({ signInWithApple: async () => 'cancelled' });
    const { result } = mount(p, onEnabled);

    await act(async () => {
      await result.current.continueWithApple();
    });

    expect(result.current.phase).toBe('apple');
    expect(result.current.error).toBeNull();
    expect(result.current.justEnabled).toBe(false);
    expect(onEnabled).not.toHaveBeenCalled();
  });

  it('does not claim sync is on when signing in threw', async () => {
    const onEnabled = jest.fn();
    const { ports: p } = ports({
      signInWithApple: async () => {
        throw new Error('apple said no');
      },
    });
    const { result } = mount(p, onEnabled);

    await act(async () => {
      await result.current.continueWithApple();
    });

    expect(result.current.phase).toBe('apple');
    expect(result.current.error).toBe('apple said no');
    expect(onEnabled).not.toHaveBeenCalled();
  });
});

describe('stopping', () => {
  it('marks the record inactive before there is no identity left to mark it with', async () => {
    const { ports: p, order } = ports();
    const { result } = mount(p);

    await act(async () => {
      await result.current.stop();
    });

    expect(order).toEqual(['mirror', 'signOut']);
    expect(result.current.error).toBeNull();
  });

  it('does not sign out when the record could not be told', async () => {
    const { ports: p, order } = ports({
      mirrorAccess: async () => {
        throw new Error('no network');
      },
    });
    const { result } = mount(p);

    await act(async () => {
      await result.current.stop();
    });

    expect(order).not.toContain('signOut');
    expect(result.current.error).toBe('no network');
  });
});
