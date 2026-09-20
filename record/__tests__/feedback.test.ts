/**
 * The one impact the record makes, and the two ways it could become a lie.
 *
 * It confirms that something was kept. So it must not fire when nothing was, and it must
 * honour the preference an upgrading install already has — which defaults to on, because
 * that is what v1 stored.
 */

import * as Haptics from 'expo-haptics';

import { setFeedbackPreferenceForTests, thoughtLanded, loadFeedbackPreference } from '../feedback';

const impact = Haptics.impactAsync as unknown as jest.Mock;

describe('what the record lets you feel', () => {
  beforeEach(() => {
    impact.mockClear();
    setFeedbackPreferenceForTests(null);
  });

  it('is one light impact, and only one', () => {
    thoughtLanded();
    expect(impact).toHaveBeenCalledTimes(1);
    expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('says nothing when the preference says not to', () => {
    setFeedbackPreferenceForTests(false);
    thoughtLanded();
    expect(impact).not.toHaveBeenCalled();
  });

  it('defaults to on, because that is what an upgrading install already has', async () => {
    await loadFeedbackPreference();
    thoughtLanded();
    expect(impact).toHaveBeenCalledTimes(1);
  });
});
