import { NativeModules, Platform } from 'react-native';
import { composeQuietMessage, quietMessageNotice } from '../quietMessage';

describe('Quiet system message composer', () => {
  const os = Platform.OS;
  afterEach(() => { Platform.OS = os; delete NativeModules.QuietMessageModule; });

  it.each(['sent', 'cancelled', 'failed', 'unavailable', 'busy'] as const)(
    'returns the %s composer result without choosing a recipient', async (result) => {
      Platform.OS = 'ios';
      const compose = jest.fn(async () => result);
      NativeModules.QuietMessageModule = { compose };
      expect(await composeQuietMessage()).toBe(result);
      expect(compose).toHaveBeenCalledWith('');
      expect(quietMessageNotice[result]).toBeTruthy();
    });

  it('never describes a sent result as confirmed delivery', () => {
    expect(quietMessageNotice.sent).toContain('Delivery is not confirmed');
  });

  it('keeps native failures recoverable', async () => {
    Platform.OS = 'ios';
    NativeModules.QuietMessageModule = { compose: jest.fn().mockRejectedValue(new Error('presentation failed')) };
    expect(await composeQuietMessage()).toBe('failed');
  });

  it('fails closed for an unknown native result', async () => {
    Platform.OS = 'ios';
    NativeModules.QuietMessageModule = { compose: async () => 'delivered' };
    expect(await composeQuietMessage()).toBe('failed');
  });

  it('reports missing native support without leaving Chinotto', async () => {
    Platform.OS = 'ios';
    expect(await composeQuietMessage()).toBe('unavailable');
  });
});
