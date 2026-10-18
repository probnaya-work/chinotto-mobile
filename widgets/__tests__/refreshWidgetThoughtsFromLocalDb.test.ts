import { NativeModules, Platform } from 'react-native';

import { getRecentEntries } from '../../storage/entryRepository';
import {
  refreshWidgetThoughtsFromLocalDb,
  WIDGET_THOUGHTS_SYNC_LIMIT,
} from '../widgetThoughtsBridge';

jest.mock('../../storage/entryRepository', () => ({
  getRecentEntries: jest.fn(),
}));

describe('refreshWidgetThoughtsFromLocalDb', () => {
  const setRecentThoughts = jest.fn().mockResolvedValue(undefined);
  let platformOsDescriptor: ReturnType<typeof Object.getOwnPropertyDescriptor> | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    platformOsDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
    (NativeModules as { WidgetThoughtsBridge?: { setRecentThoughts: typeof setRecentThoughts } }).WidgetThoughtsBridge =
      { setRecentThoughts };
  });

  afterEach(() => {
    if (platformOsDescriptor) {
      Object.defineProperty(Platform, 'OS', platformOsDescriptor);
    }
  });

  function setPlatformOS(os: string) {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: os,
    });
  }

  it('loads from DB and forwards JSON to the native bridge on iOS', async () => {
    setPlatformOS('ios');
    (getRecentEntries as jest.Mock).mockResolvedValueOnce([
      { id: 'e1', text: 'hello', createdAt: '2024-06-01T12:00:00.000Z' },
    ]);

    await refreshWidgetThoughtsFromLocalDb(true);

    expect(getRecentEntries).toHaveBeenCalledWith(WIDGET_THOUGHTS_SYNC_LIMIT);
    expect(setRecentThoughts).toHaveBeenCalledTimes(1);
    const raw = setRecentThoughts.mock.calls[0][0] as string;
    const payload = JSON.parse(raw) as {
      thoughts: { id: string; text: string; createdAt: string }[];
      syncOn: boolean;
    };
    expect(payload.thoughts).toHaveLength(1);
    expect(payload.thoughts[0].id).toBe('e1');
    expect(payload.thoughts[0].text).toBe('hello');
    // The widget uses this timestamp for the small preview and medium rows.
    expect(payload.thoughts[0].createdAt).toBe('2024-06-01T12:00:00.000Z');
    expect(payload.syncOn).toBe(true);
  });

  it('preserves sync state in the payload for older widget builds', async () => {
    setPlatformOS('ios');
    (getRecentEntries as jest.Mock).mockResolvedValueOnce([
      { id: 'e1', text: 'hello', createdAt: '2024-06-01T12:00:00.000Z' },
    ]);

    await refreshWidgetThoughtsFromLocalDb(false);

    const raw = setRecentThoughts.mock.calls[0][0] as string;
    expect((JSON.parse(raw) as { syncOn: boolean }).syncOn).toBe(false);
  });

  it('provides the two newest readable previews, including long normalized text', async () => {
    setPlatformOS('ios');
    (getRecentEntries as jest.Mock).mockResolvedValueOnce([
      { id: 'old', text: 'Earlier thought', createdAt: '2024-06-01T09:00:00.000Z' },
      { id: 'new', text: `  ${'A long thought '.repeat(12)}  `, createdAt: '2024-06-01T16:42:00.000Z' },
      { id: 'middle', text: 'A second\n thought', createdAt: '2024-06-01T12:00:00.000Z' },
    ]);

    await refreshWidgetThoughtsFromLocalDb(false);

    const raw = setRecentThoughts.mock.calls[0][0] as string;
    const { thoughts } = JSON.parse(raw) as {
      thoughts: { id: string; text: string; createdAt: string }[];
    };
    expect(thoughts.slice(0, 2).map(({ id }) => id)).toEqual(['new', 'middle']);
    expect(thoughts[0].text.length).toBeLessThanOrEqual(120);
    expect(thoughts[0].text).toMatch(/…$/);
    expect(thoughts[1].text).toBe('A second thought');
  });

  it('does not query the DB on non-iOS', async () => {
    setPlatformOS('android');

    await refreshWidgetThoughtsFromLocalDb(true);

    expect(getRecentEntries).not.toHaveBeenCalled();
    expect(setRecentThoughts).not.toHaveBeenCalled();
  });
});
