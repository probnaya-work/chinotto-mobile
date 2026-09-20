/**
 * What the sync sheet is allowed to say about money.
 *
 * Every number here comes from the store, through RevenueCat, and nothing is filled in when
 * it does not. The prototype draws `[price]`, `[saving]` and `[trial]` as unresolved copy
 * (decision 8.4); this is what resolves them, and the rule is the same as everywhere else in
 * the record — **say nothing rather than something that is not known.** A plan whose price
 * did not arrive shows its name and no price. A saving is shown only when both prices are
 * real, in the same currency, and the yearly one is genuinely cheaper.
 *
 * The trial sentence is taken from the shipping app's own rule rather than reworded, because
 * it describes an App Store offer and the wording of an offer is not a design decision.
 *
 * Pure, so the one part of this that must never lie can be exercised without a store.
 */

import {
  CHINOTTO_PACKAGE_KIND_ORDER,
  type ChinottoPackageKind,
} from '../src/services/purchases/constants';
import type { ChinottoPaywallPackage } from '../src/services/purchases/offerings';

export type PlanRow = {
  id: ChinottoPackageKind;
  name: string;
  /** Localized, from the store. Empty when the store did not say. */
  price: string;
  /** A trial, or a saving, or nothing. Never a guess. */
  note: string;
};

/** Yearly first, because it is the one most people want; lifetime last when it exists. */
const DISPLAY_ORDER: readonly ChinottoPackageKind[] = ['yearly', 'monthly', 'lifetime'];

const NAMES: Record<ChinottoPackageKind, string> = {
  monthly: 'a month',
  yearly: 'a year',
  lifetime: 'for good',
};

/**
 * `7-day free trial`, or `free trial available` when the store says somebody is eligible
 * without saying for how long. Null when there is no offer to describe.
 *
 * This is the shipping app's rule, kept as it was: it is about an App Store introductory
 * offer, and paraphrasing one is a way to get it wrong.
 */
export function trialNote(pkg: ChinottoPaywallPackage | undefined): string | null {
  if (!pkg) return null;
  if (pkg.introTrialEligibleUndisclosed === true) return 'free trial available';
  if (pkg.introIsFreeTrial !== true || pkg.introCycles == null) return null;

  const cycles = pkg.introCycles ?? 0;
  const raw = (pkg.introPeriodUnit ?? '').toLowerCase();
  const unit = raw.endsWith('s') ? raw.slice(0, -1) : raw;
  if (cycles <= 0 || unit === '') return 'includes a free trial';
  return `${cycles}-${unit} free trial`;
}

/**
 * `save 38%` — from the two real prices, or nothing.
 *
 * Requires both to be numbers in the same currency and the yearly one to actually be
 * cheaper per month. Anything else and the sheet says nothing, which is the truth.
 */
export function savingNote(
  yearly: ChinottoPaywallPackage | undefined,
  monthly: ChinottoPaywallPackage | undefined
): string | null {
  const y = yearly?.rcPackage?.product;
  const m = monthly?.rcPackage?.product;
  if (!y || !m) return null;
  if (y.currencyCode !== m.currencyCode) return null;

  // `pricePerMonth` is the store's own normalisation; falling back to a twelfth of the
  // yearly price is the same arithmetic when it is absent.
  const perMonth = typeof y.pricePerMonth === 'number' ? y.pricePerMonth : y.price / 12;
  if (!(perMonth > 0) || !(m.price > 0) || perMonth >= m.price) return null;

  const saved = Math.round((1 - perMonth / m.price) * 100);
  if (saved <= 0 || saved >= 100) return null;
  return `save ${saved}%`;
}

/** The rows the sheet draws, in the order it draws them. */
export function planRows(packages: ChinottoPaywallPackage[]): PlanRow[] {
  const by = (kind: ChinottoPackageKind) => packages.find((p) => p.kind === kind);

  return DISPLAY_ORDER.filter((kind) => by(kind) != null).map((kind) => {
    const pkg = by(kind)!;
    const note =
      kind === 'yearly'
        ? (savingNote(pkg, by('monthly')) ?? '')
        : kind === 'monthly'
          ? (trialNote(pkg) ?? '')
          : '';
    return { id: kind, name: NAMES[kind], price: pkg.priceString ?? '', note };
  });
}

/**
 * `continue · $39.99 a year`, or just `continue` when the price did not arrive.
 *
 * The button never states a price the sheet could not show, because the button is the thing
 * somebody presses to be charged.
 */
export function planCta(rows: PlanRow[], chosen: ChinottoPackageKind | null): string {
  const row = rows.find((r) => r.id === chosen) ?? rows[0];
  if (!row || !row.price) return 'continue';
  return `continue · ${row.price} ${row.name}`;
}

/** Which plan is offered first: yearly when it exists, else whatever does. */
export function defaultPlan(rows: PlanRow[]): ChinottoPackageKind | null {
  return rows.find((r) => r.id === 'yearly')?.id ?? rows[0]?.id ?? null;
}

export { CHINOTTO_PACKAGE_KIND_ORDER };
