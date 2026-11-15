import React from 'react';
import { Text, Pressable, Appearance, Animated, StyleSheet } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppearanceProvider, useRecordAppearance } from '../ui/appearance';
import { paletteFor } from '../ui/palette';
import { SURFACE, ink } from '../ui/tokens';
import { Edge } from '../ui/Edge';
import { tierClamp, tierTextStyle } from '../ui/tiers';
import { face } from '../ui/type';
function Probe() {
  const value = useRecordAppearance();
  const [draft, setDraft] = React.useState('');
  return <><Text testID="field" style={{ color: value.palette.ink.ink, backgroundColor: value.palette.SURFACE }}>{value.choice}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="light" onPress={() => value.choose('light')} />
    <Pressable accessibilityRole="button" accessibilityLabel="contrast" onPress={() => value.setContrast(true)} />
    <Edge input={draft} onChangeInput={setDraft} onSubmit={() => {}} focused onFocus={() => {}} onBlur={() => {}} onPressCaret={() => {}}
      anchored={false} onClearAnchor={() => {}} findSummary={null} recording={null} voice={false}
      onStartRecording={() => {}} onStopRecording={() => {}} onCancelRecording={() => {}} notices={[]} keyboardInset={new Animated.Value(0)} />
    </>;
}
beforeEach(async () => { await AsyncStorage.clear(); jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {}); });
afterEach(() => jest.restoreAllMocks());
it('keeps the existing dark palette as the initial appearance', () => {
  expect(paletteFor('dark')).toMatchObject({ SURFACE, ink });
});
it('switches the complete palette and native controls without remounting the app, then restores the choice', async () => {
  const ui = render(<AppearanceProvider><Probe /></AppearanceProvider>);
  const field = ui.getByLabelText('capture');
  fireEvent.changeText(field, 'мысль ещё не закончена\nsecond line');
  fireEvent.press(ui.getByLabelText('light'));
  await waitFor(() => expect(ui.getByTestId('field').props.children).toBe('light'));
  expect(ui.getByLabelText('capture')).toBe(field);
  expect(field.props.value).toBe('мысль ещё не закончена\nsecond line');
  expect(field.props.keyboardAppearance).toBe('light');
  expect(StyleSheet.flatten(field.props.style).color).toBe(paletteFor('light').ink.ink);
  expect(ui.getByTestId('field').props.style).toMatchObject({ backgroundColor: paletteFor('light').SURFACE, color: paletteFor('light').ink.ink });
  fireEvent.press(ui.getByLabelText('contrast'));
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem('chinotto.record.appearance'))!)).toEqual({ choice: 'light', contrast: true }));
  ui.unmount();
  const again = render(<AppearanceProvider><Probe /></AppearanceProvider>);
  await waitFor(() => expect(again.getByTestId('field').props.children).toBe('light'));
  expect(again.getByTestId('field').props.style.color).toBe(paletteFor('light', true).ink.ink);
  expect(Appearance.setColorScheme).toHaveBeenCalledWith('light');
});

it('renders old text with the selected palette and opens compression at large system sizes', () => {
  const light = paletteFor('light');
  expect(tierTextStyle(4, { palette: light }).color).toBe(light.ink.meta);
  expect(tierTextStyle(4, { palette: light, focused: true }).color).toBe(light.focused[4]);
  expect(tierClamp(4, false, 1)).toBe(1);
  expect(tierClamp(4, false, 1.6)).toBeUndefined();
  expect(tierTextStyle(4, { fontScale: 1.6 }).fontFamily).toBe(face(88));
});
it('does not let a late preference load replace a choice made while booting', async () => {
  let resolve!: (value: string | null) => void;
  jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const ui = render(<AppearanceProvider><Probe /></AppearanceProvider>);
  fireEvent.press(ui.getByLabelText('light'));
  resolve(JSON.stringify({ choice: 'dark', contrast: false }));
  await waitFor(() => expect(ui.getByTestId('field').props.children).toBe('light'));
});
