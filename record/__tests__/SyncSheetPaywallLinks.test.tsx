import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { SyncSheet, type SyncSheetProps } from '../ui/SyncSheet';
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from '../../monetization/legalLinks';

// The paywall must expose functional Privacy Policy and Terms of Use links (required by App
// Review for any screen offering an auto-renewable subscription). Regression test for a bug
// where "terms"/"privacy" were plain <Text> with no onPress and no URL anywhere in the app.

function baseProps(overrides: Partial<SyncSheetProps> = {}): SyncSheetProps {
  return {
    state: 'plan',
    offline: false,
    pending: 0,
    onClose: jest.fn(),
    plans: [{ id: 'yearly', name: 'yearly', price: '$29.99', note: '' }],
    chosenPlan: 'yearly',
    onPickPlan: jest.fn(),
    planCta: 'continue',
    onContinueWithPlan: jest.fn(),
    onRestore: jest.fn(),
    errorMessage: null,
    onContinueWithApple: jest.fn(),
    connectingLine: '',
    devices: [],
    justEnabled: false,
    linkCopyLabel: '',
    onCopyLink: jest.fn(),
    confirming: null,
    confirmingDeviceName: null,
    onAskRemoveDevice: jest.fn(),
    onRemoveDevice: jest.fn(),
    onAskStop: jest.fn(),
    onStop: jest.fn(),
    onCancelConfirm: jest.fn(),
    conflict: null,
    onKeepWording: jest.fn(),
    onSettleConflict: jest.fn(),
    onSignInAgain: jest.fn(),
    errorWhen: '',
    ...overrides,
  };
}

describe('SyncSheet paywall legal links', () => {
  it('opens the Terms of Use URL when "terms" is pressed', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    render(<SyncSheet {...baseProps()} />);
    fireEvent.press(screen.getByText('terms'));
    expect(openURL).toHaveBeenCalledWith(TERMS_OF_USE_URL);
  });

  it('opens the Privacy Policy URL when "privacy" is pressed', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    render(<SyncSheet {...baseProps()} />);
    fireEvent.press(screen.getByText('privacy'));
    expect(openURL).toHaveBeenCalledWith(PRIVACY_POLICY_URL);
  });
});
