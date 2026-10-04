/**
 * What this phone can do, and settings saying what Android lacks rather than offering it.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

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
        'Chinotto is for thoughts that stop mid-sentence — and for returning to them when more has gathered around them.',
        'Most notes apps help you capture, organize, or find a note later.',
        'Returning to an unfinished thought — with more around it — is rarer:',
        'How do you pick up where you left off?',
        'Most notes apps keep the file. Chinotto keeps the return — the same line, later, with more weight.',
        'You capture without closing the thought. Structure can wait until you come back — scroll the stream, follow a trail, or jump a week on the strand.',
        'On desktop, you continue threads — reopen unfinished entries, follow trails, use the time strand to jump across months, and share a read-only link when you want someone else to read along.',
        'On mobile, Chinotto is the pocket — capture with widget, voice, or share-in; search or swipe into what came before when you have a minute.',
        'Not another notes app. A place to pick up unfinished thoughts months later.',
        'Your thoughts stay local-first on your devices until you choose otherwise. Sync is optional: Sign in with Apple when you want the same stream on desktop and mobile. On desktop, optional Spaces — Inbox, Work, Personal — filter one timeline when you want separation, without folders or a workspace to set up first. There is no Chinotto account.',
        'A private record of thoughts, encounters, and what continues between them.',
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
    expect(screen.getByText('microphone')).toBeTruthy();
    expect(
      screen.getByText(/not asked yet · android asks the first time you tap the circle/)
    ).toBeTruthy();
    expect(screen.getByText(capabilitiesFor('android').privacyLine)).toBeTruthy();
    expect(screen.getByText(capabilitiesFor('android').voicePrivacyLine!)).toBeTruthy();
    expect(screen.queryByText(/unless sync is on/)).toBeNull();
  });

  it('argues the current manifesto, without promising what Android lacks', () => {
    render(<Settings {...props} page="manifesto" capabilities={capabilitiesFor('android')} />);
    expect(screen.getByText(/thoughts that stop mid-sentence/)).toBeTruthy();
    expect(screen.getByText(/tap the circle and talk, or share in/)).toBeTruthy();
    expect(screen.getByText(/stay on this phone. There is no Chinotto account./)).toBeTruthy();
    expect(screen.queryByText(/widget|sign in with apple|sync|desktop|spaces/i)).toBeNull();
    expect(screen.queryByText('Thinking rarely starts structured.')).toBeNull();
  });

  it('says nothing about updates where none are checked', () => {
    render(<Settings {...props} updateLine={null} capabilities={capabilitiesFor('android')} />);
    expect(screen.getByText('2.0.0')).toBeTruthy();
    expect(screen.queryByText(/up to date|store/)).toBeNull();
  });

  it('keeps every iOS capability in the quieter row design', () => {
    render(<Settings {...props} capabilities={capabilitiesFor('ios')} />);
    expect(screen.getByText('this iphone')).toBeTruthy();
    expect(screen.getByText('set up ›')).toBeTruthy();
    expect(screen.getByText('home screen icon')).toBeTruthy();
    expect(screen.getByText('see it')).toBeTruthy();
    expect(screen.getByText('microphone')).toBeTruthy();
    expect(screen.getByText(/not asked yet · ios asks/)).toBeTruthy();
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

  it('makes the quiet rows full-size controls instead of inline text links', () => {
    const onOpenSync = jest.fn();
    const onSeeWidget = jest.fn();
    const onToggleAnalytics = jest.fn();
    render(
      <Settings
        {...props}
        onOpenSync={onOpenSync}
        onSeeWidget={onSeeWidget}
        onToggleAnalytics={onToggleAnalytics}
        capabilities={capabilitiesFor('ios')}
      />
    );

    fireEvent.press(screen.getByLabelText('sync, set up ›'));
    fireEvent.press(screen.getByLabelText('from elsewhere, see it'));
    fireEvent.press(screen.getByLabelText('anonymous usage, off ›'));

    expect(onOpenSync).toHaveBeenCalledTimes(1);
    expect(onSeeWidget).toHaveBeenCalledTimes(1);
    expect(onToggleAnalytics).toHaveBeenCalledTimes(1);
  });
});
