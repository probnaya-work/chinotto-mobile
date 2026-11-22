import { NativeModules } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { createPrivacy, type PrivacyPort } from './privacy';

export function nativeRecordPrivacy() {
  const native = NativeModules.RecordPrivacy as Omit<PrivacyPort, 'authenticate'> | undefined;
  return createPrivacy({
    state: async () => {
      if (!native) throw new Error('Device protection requires a native build.');
      return native.state();
    },
    authenticate: () => LocalAuthentication.authenticateAsync({
      promptMessage: 'Open your Chinotto Record',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
      fallbackLabel: 'Use device code',
    }),
    complete: async (action, epoch) => {
      if (!native) throw new Error('Device protection requires a native build.');
      return native.complete(action, epoch);
    },
    rendered: async (epoch) => { await native?.rendered(epoch); },
  });
}
