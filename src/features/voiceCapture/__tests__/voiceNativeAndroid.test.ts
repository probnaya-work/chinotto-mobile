/**
 * On Android the voice and playback bridges talk to `modules/chinotto-voice`, an Expo module
 * that is its own event emitter, and keep exactly the contract the iPhone's bridge modules
 * have — so everything above them runs unchanged.
 */

type Listener = (e: unknown) => void;

function fakeModule(extra: Record<string, unknown> = {}) {
  const listeners: Record<string, Listener> = {};
  return {
    listeners,
    module: {
      addListener: (name: string, fn: Listener) => {
        listeners[name] = fn;
        return { remove: () => delete listeners[name] };
      },
      ...extra,
    },
  };
}

function onAndroid(modules: Record<string, unknown>) {
  jest.doMock('react-native', () => ({
    NativeModules: {},
    NativeEventEmitter: jest.fn(),
    Platform: { OS: 'android' },
  }));
  jest.doMock('expo', () => ({
    requireOptionalNativeModule: (name: string) => modules[name] ?? null,
  }));
  jest.doMock('../voiceNative', () => jest.requireActual('../voiceNative.android'));
  jest.doMock('../../audioPlayback/playbackNative', () =>
    jest.requireActual('../../audioPlayback/playbackNative.android')
  );
}

describe('the Android voice bridge', () => {
  afterEach(() => jest.resetModules());

  it('uses the Chinotto voice module and reports voice as supported', async () => {
    const start = jest.fn().mockResolvedValue(undefined);
    const { module } = fakeModule({ start, stop: jest.fn() });
    onAndroid({ ChinottoVoiceCapture: module });
    const native = require('../NativeVoiceCapture') as typeof import('../NativeVoiceCapture');

    expect(native.voiceCaptureSupported).toBe(true);
    await native.startVoiceCapture({ audioFileName: 'chinotto/audio/f1.m4a' });
    expect(start).toHaveBeenCalledWith({ continuous: true, audioFileName: 'chinotto/audio/f1.m4a' });
  });

  it('passes a recording with no words through as unavailable, audio intact', () => {
    const { module, listeners } = fakeModule({ start: jest.fn() });
    onAndroid({ ChinottoVoiceCapture: module });
    const native = require('../NativeVoiceCapture') as typeof import('../NativeVoiceCapture');
    const onTranscriptFinal = jest.fn();
    const unsubscribe = native.subscribeVoiceCapture({ onTranscriptFinal });

    // Exactly what VoiceCaptureModule.kt sends when the gate refuses.
    listeners.VoiceCaptureFinal({
      text: '',
      reason: 'manual',
      recognition: 'unavailable',
      audioPath: 'chinotto/audio/f1.m4a',
      durationMs: 4200,
    });
    expect(onTranscriptFinal).toHaveBeenCalledWith(
      '',
      'manual',
      { path: 'chinotto/audio/f1.m4a', durationMs: 4200 },
      undefined,
      'unavailable'
    );
    unsubscribe();
    expect(listeners.VoiceCaptureFinal).toBeUndefined();
  });

  it('reports a refused microphone as the iPhone does', () => {
    const { module, listeners } = fakeModule({ start: jest.fn() });
    onAndroid({ ChinottoVoiceCapture: module });
    const native = require('../NativeVoiceCapture') as typeof import('../NativeVoiceCapture');
    const onError = jest.fn();
    native.subscribeVoiceCapture({ onError });
    listeners.VoiceCaptureError({ code: 'permission_denied', message: 'Microphone access is not authorized.' });
    expect(onError).toHaveBeenCalledWith('permission_denied', 'Microphone access is not authorized.');
  });

  it('asks the module, not the network, whether a recording can be read back', async () => {
    const localRecognitionStatus = jest.fn().mockResolvedValueOnce('unavailable').mockResolvedValueOnce('available');
    const transcribeFile = jest.fn().mockResolvedValue({ status: 'ok', text: 'the words' });
    const { module } = fakeModule({ start: jest.fn(), localRecognitionStatus, transcribeFile });
    onAndroid({ ChinottoVoiceCapture: module });
    const native = require('../NativeVoiceCapture') as typeof import('../NativeVoiceCapture');

    expect(await native.localRecognitionStatus()).toBe('unavailable');
    expect(await native.localRecognitionStatus()).toBe('available');
    expect(await native.transcribeVoiceFile('chinotto/audio/f1.m4a')).toEqual({ status: 'ok', text: 'the words' });
  });

  it('degrades to no voice when the module is missing, rather than crashing', async () => {
    onAndroid({});
    const native = require('../NativeVoiceCapture') as typeof import('../NativeVoiceCapture');
    expect(native.voiceCaptureSupported).toBe(false);
    await expect(native.startVoiceCapture()).rejects.toThrow(/not available/);
    expect(await native.localRecognitionStatus()).toBe('unavailable');
  });

  it('plays recordings back through the Chinotto playback module', async () => {
    const play = jest.fn().mockResolvedValue(true);
    const { module, listeners } = fakeModule({ play, stop: jest.fn() });
    onAndroid({ ChinottoAudioPlayback: module });
    const playback = require('../../audioPlayback/NativeAudioPlayback') as typeof import('../../audioPlayback/NativeAudioPlayback');

    expect(playback.audioPlaybackSupported).toBe(true);
    expect(await playback.playAudio('f1', 'chinotto/audio/f1.m4a')).toBe(true);
    expect(play).toHaveBeenCalledWith({ id: 'f1', path: 'chinotto/audio/f1.m4a' });

    const onFinished = jest.fn();
    playback.subscribeAudioPlayback({ onFinished });
    listeners.AudioPlaybackFinished({ id: 'f1' });
    expect(onFinished).toHaveBeenCalledWith('f1');
  });
});

describe('the Android transcript label', () => {
  it('says the words were read on this Android phone', () => {
    const { LOCAL_READING_MODEL } = jest.requireActual('../../../../record/onDeviceModel.android');
    expect(LOCAL_READING_MODEL).toBe('android-on-device');
    const ios = jest.requireActual('../../../../record/onDeviceModel');
    expect(ios.LOCAL_READING_MODEL).toBe('ios-on-device');
  });
});
