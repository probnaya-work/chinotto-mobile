import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Appearance as NativeAppearance, StatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { paletteFor, type Appearance } from './palette';

const KEY = 'chinotto.record.appearance';
const Context = createContext({ choice: 'dark' as Appearance, contrast: false, palette: paletteFor('dark'),
  error: null as string | null, choose: (_: Appearance) => {}, setContrast: (_: boolean) => {} });
export const useRecordAppearance = () => useContext(Context);
export const useRecordTheme = () => useContext(Context).palette;

export function useRecordStatusBar(authenticationBusy: boolean) {
  const { choice } = useRecordAppearance();
  useEffect(() => {
    if (authenticationBusy) return;
    // System authentication can change native status-bar styling without changing
    // React props. Reapply after dismissal, including cancellation while still locked.
    const restore = () => StatusBar.setBarStyle(choice === 'light' ? 'dark-content' : 'light-content', false);
    restore();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') restore();
    });
    return () => subscription.remove();
  }, [choice, authenticationBusy]);
}

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoice] = useState<Appearance>('dark');
  const [contrast, setContrast] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = useRef(0);
  const save = useRef(Promise.resolve());
  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(KEY).then((raw) => {
      if (!alive || changed.current || !raw) return;
      const value = JSON.parse(raw);
      if (value.choice === 'dark' || value.choice === 'light') {
        setChoice(value.choice); setContrast(value.contrast === true);
      }
    }).catch(() => { if (alive) setError('Appearance could not be loaded. Choose it again to save.'); });
    return () => { alive = false; };
  }, []);
  useEffect(() => { NativeAppearance.setColorScheme(choice); }, [choice]);
  const value = useMemo(() => {
    const persist = (next: Appearance, lift: boolean) => {
      const revision = ++changed.current; setChoice(next); setContrast(lift); setError(null);
      // Keep rapid changes in order; an older storage write cannot replace the last choice.
      save.current = save.current.catch(() => {}).then(() => AsyncStorage.setItem(KEY, JSON.stringify({ choice: next, contrast: lift })))
        .catch(() => { if (changed.current === revision) setError('This appearance could not be saved. It may reset after restarting.'); });
    };
    return { choice, contrast, error, palette: paletteFor(choice, contrast),
      choose: (next: Appearance) => persist(next, contrast), setContrast: (next: boolean) => persist(choice, next) };
  }, [choice, contrast, error]);
  return <Context.Provider value={value}><StatusBar barStyle={choice === 'light' ? 'dark-content' : 'light-content'} backgroundColor={value.palette.SURFACE} />{children}</Context.Provider>;
}
