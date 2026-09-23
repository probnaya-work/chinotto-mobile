/**
 * What this phone can do, and settings saying what Android lacks rather than offering it.
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { capabilitiesFor } from '../platform';
import { Settings, settingsCopy, type SettingsProps } from '../ui/Settings';

describe('capabilities', () => {
  it('leaves the iPhone exactly as it ships', () => {
    expect(capabilitiesFor('ios')).toEqual({
      deviceNoun: 'iphone',
      updateGate: true,
      voice: true,
      playback: true,
      homeWidget: true,
      iconChoice: true,
      syncSetup: true,
      shareKinds: 'a page, a selection or a photo',
    });
  });

  it('claims nothing on Android that has no Android implementation', () => {
    const android = capabilitiesFor('android');
    expect(android).toMatchObject({
      deviceNoun: 'phone',
      updateGate: false,
      voice: false,
      playback: false,
      homeWidget: false,
      iconChoice: false,
      syncSetup: false,
    });
    // No live Play Store listing exists, so there is nowhere an update notice could send
    // anybody. The Android share filter is text only, so no photos.
    expect(android.shareKinds).not.toMatch(/photo/);
  });
});

describe('settings on android', () => {
  const props: SettingsProps = {
    page: 'root',
    onClose: jest.fn(),
    onBack: jest.fn(),
    syncLine: settingsCopy.sync({
      on: false,
      offline: false,
      pending: 0,
      error: false,
      otherDevice: null,
    }),
    syncVerb: 'set up',
    onOpenSync: jest.fn(),
    icon: 'dark',
    onPickIcon: jest.fn(),
    micLine: settingsCopy.microphone('ask'),
    micDenied: false,
    onOpenSystemSettings: jest.fn(),
    onSeeWidget: jest.fn(),
    analyticsOn: false,
    onToggleAnalytics: jest.fn(),
    privacyOpen: false,
    onTogglePrivacy: jest.fn(),
    hasAccount: false,
    onOpenDelete: jest.fn(),
    onOpenManifesto: jest.fn(),
    version: '2.0.0',
    updateLine: 'up to date',
    deleteArmed: false,
    onDeleteStep: jest.fn(),
    deleteBusy: false,
    deleteError: null,
  };

  it('hides what Android cannot do, without a row explaining it', () => {
    render(<Settings {...props} updateLine={null} capabilities={capabilitiesFor('android')} />);
    expect(screen.getByText('this phone')).toBeTruthy();
    expect(screen.queryByText('sync')).toBeNull();
    expect(screen.queryByText('set up ›')).toBeNull();
    expect(screen.queryByText('home screen icon')).toBeNull();
    expect(screen.queryByText(/home widget/)).toBeNull();
    expect(screen.queryByText(/microphone ·/)).toBeNull();
    expect(screen.queryByText(/android/)).toBeNull();
    expect(screen.getByText(/send a page or a selection to chinotto/)).toBeTruthy();
  });

  it('says nothing about updates where none are checked', () => {
    render(<Settings {...props} updateLine={null} capabilities={capabilitiesFor('android')} />);
    expect(screen.getByText('2.0.0')).toBeTruthy();
    expect(screen.queryByText(/up to date|store/)).toBeNull();
  });

  it('is unchanged on iOS', () => {
    render(<Settings {...props} capabilities={capabilitiesFor('ios')} />);
    expect(screen.getByText('this iphone')).toBeTruthy();
    expect(screen.getByText('set up ›')).toBeTruthy();
    expect(screen.getByText('home screen icon')).toBeTruthy();
    expect(screen.getByText('see it')).toBeTruthy();
    expect(screen.getByText(/microphone ·/)).toBeTruthy();
    expect(screen.getByText('2.0.0 · up to date')).toBeTruthy();
    expect(
      screen.getByText(
        'share sheet · send a page, a selection or a photo to chinotto from any app. it lands dated now.'
      )
    ).toBeTruthy();
  });
});
