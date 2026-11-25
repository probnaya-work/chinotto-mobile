import { NativeModules, Platform } from 'react-native';

export type QuietMessageResult = 'sent' | 'cancelled' | 'failed' | 'unavailable' | 'busy';

/** Native MessageUI; never opens another app or requests the address book. */
export async function composeQuietMessage(): Promise<QuietMessageResult> {
  if (Platform.OS !== 'ios' || !NativeModules.QuietMessageModule?.compose) return 'unavailable';
  try {
    const result: unknown = await NativeModules.QuietMessageModule.compose('');
    return result === 'sent' || result === 'cancelled' || result === 'unavailable' || result === 'busy'
      ? result : 'failed';
  } catch {
    return 'failed';
  }
}

export const quietMessageNotice: Record<QuietMessageResult, string> = {
  sent: 'Message handed to Messages. Delivery is not confirmed here.',
  cancelled: 'Message cancelled. You’re back in Quiet.',
  failed: 'The message could not be sent. You can try Message again or keep using Quiet.',
  unavailable: 'Messages aren’t available on this iPhone. You can still capture a thought here.',
  busy: 'A message is already open. Finish or cancel it to return to Quiet.',
};
