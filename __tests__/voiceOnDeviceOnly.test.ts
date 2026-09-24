import * as fs from 'fs';
import * as path from 'path';

/**
 * Recognition on this iPhone, or not at all.
 *
 * `SFSpeechRecognizer` sends audio to Apple's servers unless the request *requires*
 * on-device recognition **and** the recogniser *supports* it — Apple ignores the flag where
 * support is missing. Earlier builds set the flag only when support was there and otherwise
 * went ahead anyway, which is a server path. Nothing a Jest test can run exercises Speech,
 * so this reads the module and holds it to the shape that makes a server path impossible:
 *
 *   · exactly one place creates a recognition task, and it checks support and sets the
 *     requirement before it does;
 *   · every request goes through that place, and a buffer request is only kept once it has;
 *   · audio reaches Speech only through that kept request;
 *   · the microphone is the only permission that can stop a recording.
 */

const SOURCE = path.join(__dirname, '..', 'ios', 'Chinotto', 'VoiceCaptureModule.swift');
const swift = fs.readFileSync(SOURCE, 'utf8');
/** Comments say what the code must not do; only the code is held to it. */
const code = swift
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

const count = (needle: string | RegExp) =>
  typeof needle === 'string' ? code.split(needle).length - 1 : (code.match(needle) ?? []).length;

function bodyOf(signature: string): string {
  const start = code.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = code.indexOf('{', start); i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    if (code[i] === '}') depth -= 1;
    if (depth === 0) return code.slice(start, i + 1);
  }
  throw new Error(`unterminated ${signature}`);
}

describe('iOS voice recognition stays on the device', () => {
  const gate = bodyOf('static func onDeviceTask(');

  it('creates a recognition task in exactly one place', () => {
    expect(count('.recognitionTask(')).toBe(1);
    expect(gate).toContain('recognizer.recognitionTask(with: request');
  });

  it('checks support and sets the requirement before that task exists', () => {
    const support = gate.indexOf('guard recognizer.supportsOnDeviceRecognition else { return nil }');
    const require = gate.indexOf('request.requiresOnDeviceRecognition = true');
    const confirm = gate.indexOf('guard request.requiresOnDeviceRecognition else { return nil }');
    const task = gate.indexOf('recognizer.recognitionTask(');
    expect(support).toBeGreaterThan(-1);
    expect(require).toBeGreaterThan(support);
    expect(confirm).toBeGreaterThan(require);
    expect(task).toBeGreaterThan(confirm);
  });

  it('never turns the requirement off, and never sets it conditionally elsewhere', () => {
    expect(count(/requiresOnDeviceRecognition\s*=\s*false/g)).toBe(0);
    expect(count(/requiresOnDeviceRecognition\s*=/g)).toBe(1);
  });

  it('sends every request through the gate', () => {
    expect(count('SFSpeechAudioBufferRecognitionRequest()')).toBe(1);
    expect(count('SFSpeechURLRecognitionRequest(')).toBe(1);
    expect(count('Self.onDeviceTask(')).toBe(2);
  });

  it('keeps a live request only once the gate has given it a task', () => {
    const attach = bodyOf('private func attachRecognitionTask(');
    const gated = attach.indexOf('Self.onDeviceTask(');
    const refused = attach.indexOf('guard let newTask else');
    const kept = attach.indexOf('request = speechRequest');
    expect(gated).toBeGreaterThan(-1);
    expect(refused).toBeGreaterThan(gated);
    expect(kept).toBeGreaterThan(refused);
    // `request` is assigned a new request nowhere else.
    expect(count(/\brequest = speechRequest\b/g)).toBe(1);
    expect(count(/\bself\.request = /g)).toBe(0);
  });

  it('hands audio to Speech only through that request', () => {
    expect(count('.append(')).toBe(1);
    expect(code).toContain('request?.append(buffer)');
  });

  it('asks for speech recognition without ever making the recording depend on it', () => {
    const start = bodyOf('func start(');
    // The microphone decides whether there is a recording.
    expect(start).toContain('self.requestMicrophone');
    expect(start).toContain('guard granted else');
    // Speech decides only whether it has words: whatever `resolveRecognizer` answers, the
    // session starts.
    expect(start).toMatch(/resolveRecognizer\(locale: locale, mayAsk: true\) \{ speechRec, status in[\s\S]*startSession\(/);
    const resolve = bodyOf('private func resolveRecognizer(');
    expect(resolve).not.toContain('reject(');
    expect(count('E_VOICE_PERMISSION')).toBe(1);
  });

  it('reports which path was taken, so the transcript can be labelled honestly', () => {
    expect(code).toContain('"recognition": recognition.rawValue');
    expect(code).toContain('case onDevice = "on_device"');
  });

  it('a background retry never raises a prompt', () => {
    expect(bodyOf('func transcribeFile(')).toContain('mayAsk: false');
    expect(bodyOf('func localRecognitionStatus(')).not.toContain('requestAuthorization');
  });

  it('is exposed to JavaScript', () => {
    const bridge = fs.readFileSync(path.join(__dirname, '..', 'ios', 'Chinotto', 'VoiceCaptureModule.m'), 'utf8');
    expect(bridge).toContain('RCT_EXTERN_METHOD(transcribeFile:(NSString *)relativePath');
    expect(bridge).toContain('RCT_EXTERN_METHOD(localRecognitionStatus:(RCTPromiseResolveBlock)resolve');
  });
});
