import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import type { RecordPrivacy } from './privacy';

const off = { enabled: false, locked: false, epoch: 0, ready: true, busy: false, error: null };
const subscribeOff = () => () => {};
const snapshotOff = () => off;

export function usePrivacy(privacy?: RecordPrivacy) {
  const state = useSyncExternalStore(privacy?.subscribe ?? subscribeOff, privacy?.snapshot ?? snapshotOff);
  useEffect(() => {
    if (!privacy) return;
    void privacy.refresh();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') privacy.background();
      // Inactive can be the OS authentication prompt; only background ends a session.
      if (next === 'active' || next === 'background') void privacy.refresh();
    });
    return () => subscription.remove();
  }, [privacy]);
  useLayoutEffect(() => {
    if (state.ready) void privacy?.rendered();
  }, [privacy, state]);
  return state;
}
