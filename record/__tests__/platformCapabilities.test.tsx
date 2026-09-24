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
      systemName: 'ios',
      privacyLine:
        'the words stay on this phone unless sync is on, and then only go to your own devices.',
      voicePrivacyLine: null,
      manifesto: [
        'Thinking rarely starts structured.',
        'Most tools assume the opposite. They ask you to create a document, a folder, a workspace before you even know what the thought is.',
        'So you name things, you organize, you plan — and the thought slips away. Sometimes you do not write it down at all because the friction is too high.',
        'Chinotto is built for the moment the thought appears. You open it, capture it, and move on. No hierarchy to maintain. Just capture.',
        'Structure can come later, when the thought has had time to settle. Not before.',
      ],
    });
  });

  it('claims nothing on Android that has no Android implementation', () => {
    const android = capabilitiesFor('android');
    expect(android).toMatchObject({
      deviceNoun: 'phone',
      updateGate: false,
      // modules/chinotto-voice: recording and playback are real on Android.
      voice: true,
      playback: true,
      homeWidget: false,
      iconChoice: false,
      syncSetup: false,
    });
    // No live Play Store listing exists, so there is nowhere an update notice could send
    // anybody. The Android share filter is text only, so no photos.
    expect(android.shareKinds).not.toMatch(/photo/);
  });

  it('describes on Android only what Android does', () => {
    const android = capabilitiesFor('android');
    const copy = [android.privacyLine, android.voicePrivacyLine ?? '', ...android.manifesto].join(' ');
    expect(copy).not.toMatch(/sync|own devices|apple|iphone|\bios\b|\bmac\b|desktop|widget|subscri|cloud|sign in/i);
    expect(android.privacyLine).toMatch(/stay on this phone/);
    // The voice rule, exactly: words only from a recogniser that can't reach the internet,
    // and otherwise the recording is kept without words.
    expect(android.voicePrivacyLine).toMatch(/on-device recogniser/);
    expect(android.voicePrivacyLine).toMatch(/can’t reach the internet/);
    expect(android.voicePrivacyLine).toMatch(/kept here without words/);
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
    render(
      <Settings
        {...props}
        micLine={settingsCopy.microphone('ask', 'android')}
        updateLine={null}
        capabilities={capabilitiesFor('android')}
      />
    );
    expect(screen.getByText('this phone')).toBeTruthy();
    expect(screen.queryByText('sync')).toBeNull();
    expect(screen.queryByText('set up ›')).toBeNull();
    expect(screen.queryByText('home screen icon')).toBeNull();
    expect(screen.queryByText(/home widget/)).toBeNull();
    expect(screen.queryByText(/apple|icloud|iphone|\bios\b|\bmac\b|subscri|cloud account/i)).toBeNull();
    expect(screen.getByText(/send a page or a selection to chinotto/)).toBeTruthy();
  });

  it('names Android where the system is the one asking, and says what voice does', () => {
    render(
      <Settings
        {...props}
        micLine={settingsCopy.microphone('ask', 'android')}
        updateLine={null}
        capabilities={capabilitiesFor('android')}
      />
    );
    expect(
      screen.getByText(/microphone · not asked yet · android asks the first time you hold the circle/)
    ).toBeTruthy();
    expect(screen.getByText(capabilitiesFor('android').privacyLine)).toBeTruthy();
    expect(screen.getByText(capabilitiesFor('android').voicePrivacyLine!)).toBeTruthy();
    expect(screen.queryByText(/unless sync is on/)).toBeNull();
  });

  it('argues the current manifesto, without promising what Android lacks', () => {
    render(<Settings {...props} page="manifesto" capabilities={capabilitiesFor('android')} />);
    expect(screen.getByText(/thoughts that stop mid-sentence/)).toBeTruthy();
    expect(screen.getByText(/hold the circle and talk, or share in/)).toBeTruthy();
    expect(screen.getByText(/stay on this phone. There is no Chinotto account./)).toBeTruthy();
    expect(screen.queryByText(/widget|sign in with apple|sync|desktop|spaces/i)).toBeNull();
    expect(screen.queryByText('Thinking rarely starts structured.')).toBeNull();
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
    expect(screen.getByText(/microphone · not asked yet · ios asks/)).toBeTruthy();
    expect(
      screen.getByText(
        'the words stay on this phone unless sync is on, and then only go to your own devices.'
      )
    ).toBeTruthy();
    expect(screen.queryByText(/on-device recogniser/)).toBeNull();
    expect(screen.getByText('2.0.0 · up to date')).toBeTruthy();
    expect(
      screen.getByText(
        'share sheet · send a page, a selection or a photo to chinotto from any app. it lands dated now.'
      )
    ).toBeTruthy();
  });
});
