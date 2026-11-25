import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QuietHomeGuide } from '../ui/QuietHomeGuide';

it('shows setup and daily use together with no prototype actions', () => {
  const close = jest.fn();
  render(<QuietHomeGuide onClose={close} backTo="Settings" />);
  expect(screen.getByText('Set up once')).toBeTruthy();
  expect(screen.getByText('Daily use')).toBeTruthy();
  expect(screen.getByLabelText('Step 3. Edit › Add Widget › Chinotto')).toBeTruthy();
  expect(screen.getAllByRole('button')).toHaveLength(1);
  fireEvent.press(screen.getByText('‹ Settings'));
  expect(close).toHaveBeenCalledTimes(1);
});
