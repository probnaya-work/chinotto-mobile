import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { RestoreArchive } from '../ui/RestoreArchive';
import { prepareNativeRestore } from '../nativeRestore';
import { getDocumentAsync } from 'expo-document-picker';
jest.mock('../nativeRestore', () => ({ prepareNativeRestore: jest.fn(), removePickedArchive: jest.fn() }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
const prepare = prepareNativeRestore as jest.Mock;
const pick = getDocumentAsync as jest.Mock;
beforeEach(() => { jest.clearAllMocks(); pick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://archive.zip' }] }); });
const preview = { newMoments: 2, audioFiles: 1, newArchived: 0, duplicates: 1, changed: 1, removed: 1, waitingLinks: 1, skippedJudgements: 0, from: null, to: null, sample: [{ body: 'older thought', at: '' }] };
it('reviews before writing, reports skipped records and refreshes only after restore', async () => {
  const restore = jest.fn(async () => preview); const dispose = jest.fn(); const changed = jest.fn();
  prepare.mockResolvedValue({ preview, restore, dispose });
  const ui = render(<RestoreArchive db={{} as never} onRestored={changed} />);
  fireEvent.press(ui.getByLabelText('Choose archive'));
  await waitFor(() => expect(ui.getByText('older thought')).toBeTruthy());
  expect(restore).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
  expect(ui.getByText(/previously removed/)).toBeTruthy();
  fireEvent.press(ui.getByLabelText('Restore archive'));
  await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
  expect(dispose).toHaveBeenCalled(); expect(ui.getByText(/Restored 2 thoughts/)).toBeTruthy();
});
it('cancels without writing and disposes a late preview after leaving settings', async () => {
  const restore = jest.fn(); const dispose = jest.fn(); let finish!: (value: unknown) => void;
  prepare.mockReturnValue(new Promise((r) => { finish = r; }));
  const ui = render(<RestoreArchive db={{} as never} onRestored={jest.fn()} />);
  fireEvent.press(ui.getByLabelText('Choose archive')); await waitFor(() => expect(prepare).toHaveBeenCalled());
  const signal = prepare.mock.calls[0][2] as AbortSignal; ui.unmount(); expect(signal.aborted).toBe(true);
  finish({ preview, restore, dispose }); await waitFor(() => expect(dispose).toHaveBeenCalled()); expect(restore).not.toHaveBeenCalled();
});
it('does not open a file picker when device authentication is cancelled', async () => {
  const ui = render(<RestoreArchive db={{} as never} onRestored={jest.fn()} privacy={{ snapshot: () => ({ enabled: true }), request: async () => false } as never} />);
  fireEvent.press(ui.getByLabelText('Choose archive')); await waitFor(() => expect(ui.getByLabelText('Choose archive')).toBeTruthy());
  expect(pick).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled();
});
