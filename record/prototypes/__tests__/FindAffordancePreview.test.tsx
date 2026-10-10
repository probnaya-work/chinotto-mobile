import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { FindAffordancePreview, findPreviewLayout } from '../FindAffordancePreview';

const base = { width: 390, fontScale: 1, safeTop: 54, anchored: false, focused: false, keyboardVisible: false };

it('activates the existing Find command callback with a standard button', () => {
  const setInput = jest.fn();
  const focusInput = jest.fn();
  render(<FindAffordancePreview {...base} setInput={setInput} focusInput={focusInput} />);
  const button = screen.getByTestId('find-preview');
  expect(button.props.accessibilityRole).toBe('button');
  fireEvent.press(button);
  expect(setInput).toHaveBeenCalledWith('/');
  expect(focusInput).toHaveBeenCalledTimes(1);
  expect(findPreviewLayout(base).pullResponderRightInset).toBeGreaterThan(0);
});

it.each([
  { width: 320 }, { fontScale: 1.5 }, { anchored: true },
  { focused: true }, { keyboardVisible: true },
])('yields the top strip in a competing state: %o', (change) => {
  const state = { ...base, ...change };
  expect(findPreviewLayout(state).visible).toBe(false);
  expect(findPreviewLayout(state).pullResponderRightInset).toBe(0);
});
