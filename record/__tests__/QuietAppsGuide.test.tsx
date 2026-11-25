import React from 'react';
import { NativeModules } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QuietHomeGuide } from '../ui/QuietHomeGuide';

describe('Quiet apps experiment', () => {
  const original = NativeModules.QuietAppsModule;
  afterEach(() => { NativeModules.QuietAppsModule = original; });
  const guide = () => render(<QuietHomeGuide onClose={jest.fn()} onCapture={jest.fn()} />);

  it('requests the native sheet only after an explicit tap and can retry presentation', async () => {
    const open = jest.fn().mockRejectedValueOnce(new Error('busy')).mockResolvedValue(undefined);
    NativeModules.QuietAppsModule = { open };
    guide();
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByText('Choose your Quiet page')).toBeTruthy();
    expect(screen.queryByText('Hide apps with Quiet')).toBeNull();
    fireEvent.press(screen.getByText('Previous app-hiding experiment'));
    fireEvent.press(screen.getByText('Hide apps with Quiet'));
    await screen.findByText('Couldn’t open Quiet. Try again.');
    fireEvent.press(screen.getByText('Hide apps with Quiet'));
    await waitFor(() => expect(screen.queryByText('Couldn’t open Quiet. Try again.')).toBeNull());
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('keeps existing Quiet choices available on builds without the module', () => {
    NativeModules.QuietAppsModule = undefined;
    guide();
    expect(screen.queryByText('Hide apps with Quiet')).toBeNull();
    expect(screen.getByText('Open in-app Quiet capture')).toBeTruthy();
  });
});
