import { listRetainedAudio, recordFileSize } from '../files';
import { availableDeviceBytes, formatStorage, retainedAudioBytes, storageLooksLow } from '../storage';

jest.mock('../files', () => ({ listRetainedAudio: jest.fn(), recordFileSize: jest.fn() }));
jest.mock('expo-file-system', () => ({ Paths: { availableDiskSpace: 32 * 1024 ** 2 } }));

const list = jest.mocked(listRetainedAudio);
const size = jest.mocked(recordFileSize);

it('counts retained files, including audio not referenced by a fragment', () => {
  list.mockReturnValue(['chinotto/audio/one.m4a', 'chinotto/audio/orphan.m4a']);
  size.mockImplementation((path) => path.includes('orphan') ? 2048 : 4096);
  expect(retainedAudioBytes()).toBe(6144);
  expect(formatStorage(6144)).toBe('6 KB');
});

it('distinguishes unavailable measurement from zero usage', () => {
  list.mockReturnValue(null);
  expect(retainedAudioBytes()).toBeNull();
  list.mockReturnValue([]);
  expect(retainedAudioBytes()).toBe(0);
});

it('warns on measured low free space without creating a recording limit', () => {
  expect(availableDeviceBytes()).toBe(32 * 1024 ** 2);
  expect(storageLooksLow(availableDeviceBytes())).toBe(true);
  expect(storageLooksLow(null)).toBe(false);
  expect(storageLooksLow(256 * 1024 ** 2)).toBe(false);
});
