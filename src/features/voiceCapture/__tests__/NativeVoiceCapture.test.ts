describe('NativeVoiceCapture', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('reports unsupported off iOS or without native module', () => {
    jest.doMock('react-native', () => ({
      NativeModules: {},
      NativeEventEmitter: jest.fn(),
      Platform: { OS: 'android' },
    }));
    const { voiceCaptureSupported } = require('../NativeVoiceCapture') as typeof import('../NativeVoiceCapture');
    expect(voiceCaptureSupported).toBe(false);
  });

  it('starts continuous voice capture by default', async () => {
    const start = jest.fn().mockResolvedValue(undefined);
    jest.doMock('react-native', () => ({
      NativeModules: { VoiceCaptureModule: { start } },
      NativeEventEmitter: jest.fn(),
      Platform: { OS: 'ios' },
    }));
    const { startVoiceCapture } = require('../NativeVoiceCapture') as typeof import('../NativeVoiceCapture');

    await startVoiceCapture();

    expect(start).toHaveBeenCalledWith({ continuous: true });
  });

  it('passes locale and burst mode when requested', async () => {
    const start = jest.fn().mockResolvedValue(undefined);
    jest.doMock('react-native', () => ({
      NativeModules: { VoiceCaptureModule: { start } },
      NativeEventEmitter: jest.fn(),
      Platform: { OS: 'ios' },
    }));
    const { startVoiceCapture } = require('../NativeVoiceCapture') as typeof import('../NativeVoiceCapture');

    await startVoiceCapture({ continuous: false, locale: 'en-US' });

    expect(start).toHaveBeenCalledWith({ continuous: false, locale: 'en-US' });
  });

  it('passes on which recognition path a recording took, and nothing it does not know', () => {
    const listeners: Record<string, (e: unknown) => void> = {};
    jest.doMock('react-native', () => ({
      NativeModules: { VoiceCaptureModule: { start: jest.fn() } },
      NativeEventEmitter: jest.fn().mockImplementation(() => ({
        addListener: (name: string, fn: (e: unknown) => void) => {
          listeners[name] = fn;
          return { remove: () => {} };
        },
      })),
      Platform: { OS: 'ios' },
    }));
    const { subscribeVoiceCapture } = require('../NativeVoiceCapture') as typeof import('../NativeVoiceCapture');
    const onTranscriptFinal = jest.fn();
    subscribeVoiceCapture({ onTranscriptFinal });

    listeners.VoiceCaptureFinal({ text: '', reason: 'manual', audioPath: 'chinotto/audio/a.m4a', durationMs: 900, recognition: 'unavailable' });
    listeners.VoiceCaptureFinal({ text: 'hi', reason: 'manual', recognition: 'server' });

    expect(onTranscriptFinal.mock.calls[0]).toEqual(['', 'manual', { path: 'chinotto/audio/a.m4a', durationMs: 900 }, undefined, 'unavailable']);
    expect(onTranscriptFinal.mock.calls[1][4]).toBeNull();
  });

  it('maps file transcription answers, and treats anything unexpected as a failure', async () => {
    const transcribeFile = jest
      .fn()
      .mockResolvedValueOnce({ status: 'ok', text: 'words' })
      .mockResolvedValueOnce({ status: 'ok', text: '   ' })
      .mockResolvedValueOnce({ status: 'unavailable' })
      .mockResolvedValueOnce({ status: 'something new' });
    jest.doMock('react-native', () => ({
      NativeModules: { VoiceCaptureModule: { start: jest.fn(), transcribeFile } },
      NativeEventEmitter: jest.fn(),
      Platform: { OS: 'ios' },
    }));
    const { transcribeVoiceFile } = require('../NativeVoiceCapture') as typeof import('../NativeVoiceCapture');
    expect(await transcribeVoiceFile('chinotto/audio/a.m4a')).toEqual({ status: 'ok', text: 'words' });
    expect(await transcribeVoiceFile('chinotto/audio/a.m4a')).toEqual({ status: 'failed' });
    expect(await transcribeVoiceFile('chinotto/audio/a.m4a')).toEqual({ status: 'unavailable' });
    expect(await transcribeVoiceFile('chinotto/audio/a.m4a')).toEqual({ status: 'failed' });
  });

  it('says local recognition is unavailable where there is no native module to ask', async () => {
    jest.doMock('react-native', () => ({
      NativeModules: {},
      NativeEventEmitter: jest.fn(),
      Platform: { OS: 'android' },
    }));
    const { localRecognitionStatus, transcribeVoiceFile } =
      require('../NativeVoiceCapture') as typeof import('../NativeVoiceCapture');
    expect(await localRecognitionStatus()).toBe('unavailable');
    expect(await transcribeVoiceFile('chinotto/audio/a.m4a')).toEqual({ status: 'unavailable' });
  });
});
