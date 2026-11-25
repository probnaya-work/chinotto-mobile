import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QuietHomeGuide } from '../ui/QuietHomeGuide';

it('shows setup and daily use together with no prototype actions', () => {
  const close = jest.fn();
  render(<QuietHomeGuide onClose={close} backTo="Settings" />);
  expect(screen.getByText('Set up once')).toBeTruthy();
  expect(screen.getByText('Daily use')).toBeTruthy();
  expect(screen.getByText(/Personal Focus shows your Quiet page/)).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Step 1. Choose a Home Screen page' })).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Step 2. Turn on Personal' })).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Step 3. Add the Chinotto widget' })).toBeTruthy();
  expect(screen.getByText(/Swipe Home from Messages or Chinotto/)).toBeTruthy();
  expect(screen.getAllByRole('button')).toHaveLength(1);
  fireEvent.press(screen.getByText('‹ Settings'));
  expect(close).toHaveBeenCalledTimes(1);
});
