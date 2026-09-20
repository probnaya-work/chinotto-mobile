/**
 * The one part of the record that charges money must not say anything the store did not.
 *
 * Every case here is a way the sheet could claim a price, a saving or a trial it has no
 * business claiming, written down so it cannot.
 */

import { defaultPlan, planCta, planRows, savingNote, trialNote } from '../paywall';
import type { ChinottoPaywallPackage } from '../../src/services/purchases/offerings';

type Productish = {
  price: number;
  currencyCode: string;
  pricePerMonth?: number | null;
};

function pkg(
  kind: 'monthly' | 'yearly' | 'lifetime',
  priceString: string | undefined,
  product: Productish | null,
  intro: Partial<ChinottoPaywallPackage> = {}
): ChinottoPaywallPackage {
  return {
    kind,
    storeProductId: kind,
    priceString,
    rcPackage: (product ? { product } : {}) as ChinottoPaywallPackage['rcPackage'],
    ...intro,
  } as ChinottoPaywallPackage;
}

describe('what the sheet may say about a trial', () => {
  it('names the offer the store actually described', () => {
    expect(
      trialNote(
        pkg('monthly', '$4.99', null, {
          introIsFreeTrial: true,
          introCycles: 7,
          introPeriodUnit: 'DAYS',
        })
      )
    ).toBe('7-day free trial');
  });

  it('says only that one is available when the store did not say how long', () => {
    expect(trialNote(pkg('monthly', '$4.99', null, { introTrialEligibleUndisclosed: true }))).toBe(
      'free trial available'
    );
  });

  it('says nothing when there is no offer', () => {
    expect(trialNote(pkg('monthly', '$4.99', null))).toBeNull();
    expect(trialNote(undefined)).toBeNull();
  });

  it('does not invent a length from a broken period', () => {
    expect(
      trialNote(
        pkg('monthly', '$4.99', null, {
          introIsFreeTrial: true,
          introCycles: 0,
          introPeriodUnit: '',
        })
      )
    ).toBe('includes a free trial');
  });
});

describe('what the sheet may say about a saving', () => {
  const monthly = pkg('monthly', '$4.99', { price: 4.99, currencyCode: 'USD' });

  it('is arithmetic on two real prices', () => {
    const yearly = pkg('yearly', '$39.99', {
      price: 39.99,
      currencyCode: 'USD',
      pricePerMonth: 3.33,
    });
    expect(savingNote(yearly, monthly)).toBe('save 33%');
  });

  it('works out the per-month price itself when the store did not', () => {
    const yearly = pkg('yearly', '$39.99', { price: 39.99, currencyCode: 'USD' });
    // 39.99/12 = 3.3325 against 4.99 → 33%.
    expect(savingNote(yearly, monthly)).toBe('save 33%');
  });

  it('says nothing across currencies, because that is not a comparison', () => {
    const yearly = pkg('yearly', '€39.99', { price: 39.99, currencyCode: 'EUR' });
    expect(savingNote(yearly, monthly)).toBeNull();
  });

  it('says nothing when yearly is not actually cheaper', () => {
    const yearly = pkg('yearly', '$79.99', { price: 79.99, currencyCode: 'USD' });
    expect(savingNote(yearly, monthly)).toBeNull();
  });

  it('says nothing when either price is missing', () => {
    expect(savingNote(pkg('yearly', '$39.99', null), monthly)).toBeNull();
    expect(savingNote(pkg('yearly', '$39.99', { price: 39.99, currencyCode: 'USD' }), undefined))
      .toBeNull();
  });
});

describe('the rows, and the button', () => {
  const packages = [
    pkg('monthly', '$4.99', { price: 4.99, currencyCode: 'USD' }, {
      introIsFreeTrial: true,
      introCycles: 7,
      introPeriodUnit: 'DAYS',
    }),
    pkg('yearly', '$39.99', { price: 39.99, currencyCode: 'USD', pricePerMonth: 3.33 }),
  ];

  it('offers the year first, and says what each one is', () => {
    const rows = planRows(packages);
    expect(rows.map((r) => r.id)).toEqual(['yearly', 'monthly']);
    expect(rows[0]).toEqual({ id: 'yearly', name: 'a year', price: '$39.99', note: 'save 33%' });
    expect(rows[1]).toEqual({
      id: 'monthly',
      name: 'a month',
      price: '$4.99',
      note: '7-day free trial',
    });
    expect(defaultPlan(rows)).toBe('yearly');
  });

  it('draws only the plans the offering actually has', () => {
    expect(planRows([packages[0]]).map((r) => r.id)).toEqual(['monthly']);
    expect(planRows([])).toEqual([]);
  });

  it('keeps a plan whose price never arrived, without inventing one', () => {
    const rows = planRows([pkg('yearly', undefined, null)]);
    expect(rows[0]).toEqual({ id: 'yearly', name: 'a year', price: '', note: '' });
  });

  it('never puts a price on the button that the sheet could not show', () => {
    expect(planCta(planRows(packages), 'yearly')).toBe('continue · $39.99 a year');
    expect(planCta(planRows([pkg('yearly', undefined, null)]), 'yearly')).toBe('continue');
    expect(planCta([], null)).toBe('continue');
  });
});
