import * as fs from 'fs';
import * as path from 'path';

/**
 * Recognition on this Android phone, by a recogniser that cannot reach the network, or not
 * at all.
 *
 * Android's documentation does not promise that any recogniser keeps audio local, so the
 * module checks it on the phone (`OnDevicePolicy.kt`, tested on the JVM in
 * `modules/chinotto-voice/android/src/test`). Nothing Jest runs can exercise
 * `SpeechRecognizer`, so this reads the Kotlin and holds it to the shape that makes a network
 * recogniser unreachable:
 *
 *   · the default recogniser — which the platform says "is likely to stream audio to remote
 *     servers" — is never created, and the on-device one is created in exactly one place,
 *     after every rule has passed;
 *   · every recognition is started with our own audio, through the one intent builder;
 *   · a recogniser that lists online languages is refused;
 *   · the recording is written before anything is handed to a recogniser;
 *   · the microphone is asked for only by somebody holding the circle, never by a retry;
 *   · the module adds no network permission of its own.
 */

const DIR = path.join(__dirname, '..', 'modules', 'chinotto-voice', 'android', 'src', 'main');
const KT = path.join(DIR, 'java', 'com', 'chinotto', 'voice');

function code(file: string): string {
  // Comments say what the code must not do; only the code is held to it.
  return fs
    .readFileSync(path.join(KT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

const files = fs.readdirSync(KT).filter((f) => f.endsWith('.kt'));
const all = files.map(code).join('\n');
const count = (source: string, needle: string) => source.split(needle).length - 1;

function bodyOf(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated ${signature}`);
}

describe('Android voice recognition stays on the device', () => {
  const gate = code('OnDeviceGate.kt');

  it('never creates the default recogniser, and the on-device one in exactly one place', () => {
    expect(count(all, 'SpeechRecognizer.createSpeechRecognizer(')).toBe(0);
    expect(count(all, 'createOnDeviceSpeechRecognizerForTest')).toBe(0);
    expect(count(all, 'createOnDeviceSpeechRecognizer(')).toBe(1);
    expect(count(gate, 'SpeechRecognizer.createOnDeviceSpeechRecognizer(context)')).toBe(1);
  });

  it('creates it only after the version, the service and its network isolation are checked', () => {
    const mayBeUsed = bodyOf(gate, 'fun serviceMayBeUsed()');
    expect(mayBeUsed).toContain('OnDevicePolicy.sdkAllowsWords(Build.VERSION.SDK_INT)');
    expect(mayBeUsed).toContain('SpeechRecognizer.isOnDeviceRecognitionAvailable(context)');
    expect(mayBeUsed).toContain('OnDevicePolicy.isNetworkIsolated(serviceFacts())');

    const open = bodyOf(gate, 'fun open(');
    expect(open.indexOf('serviceMayBeUsed()')).toBeGreaterThan(-1);
    expect(open.indexOf('openChecked(')).toBeGreaterThan(open.indexOf('serviceMayBeUsed()'));
    // openChecked is reachable from nowhere else.
    expect(count(all, 'openChecked(')).toBe(2); // the call in open, and its declaration
  });

  it('reads the facts about the service from the phone, not from a name', () => {
    const facts = bodyOf(gate, 'fun serviceFacts()');
    expect(facts).toContain('config_defaultOnDeviceSpeechRecognitionService');
    expect(facts).toContain('PackageManager.GET_PERMISSIONS');
    expect(facts).toContain('ApplicationInfo.FLAG_SYSTEM');
    expect(facts).toContain('pm.checkPermission(OnDevicePolicy.INTERNET');
    // A package this app cannot see is not assumed to be fine.
    expect(facts).toContain('OnDevicePolicy.ServiceFacts(false, false, emptyList(), false)');
  });

  it('refuses a recogniser that offers online languages, and one without the language installed', () => {
    const checked = bodyOf(gate, 'private fun openChecked(');
    expect(checked).toContain('support.installedOnDeviceLanguages');
    expect(checked).toContain('support.onlineLanguages');
    expect(checked).not.toContain('triggerModelDownload');
    const policy = code('OnDevicePolicy.kt');
    expect(bodyOf(policy, 'fun chooseLanguage(')).toContain('if (online.isNotEmpty()) return null');
  });

  it('starts every recognition with our own audio, through one intent builder', () => {
    expect(count(all, '.startListening(')).toBe(1);
    const session = code('RecognitionSession.kt');
    expect(session).toContain('recognizer.startListening(\n      OnDeviceGate.recognitionIntent(');
    const intent = bodyOf(gate, 'fun recognitionIntent(');
    expect(intent).toContain('RecognizerIntent.EXTRA_AUDIO_SOURCE, audio');
    expect(intent).toContain('RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE');
    expect(count(all, 'RecognizerIntent.ACTION_RECOGNIZE_SPEECH')).toBe(2); // probe + recognition
  });

  it('writes the recording before handing anything to a recogniser', () => {
    const loop = bodyOf(code('VoiceCaptureModule.kt'), 'private fun readLoop(');
    expect(loop.indexOf('writer?.write(buffer, n)')).toBeGreaterThan(-1);
    expect(loop.indexOf('handOn(buffer, n)')).toBeGreaterThan(loop.indexOf('writer?.write(buffer, n)'));
  });

  it('asks for the microphone only when somebody holds the circle', () => {
    const module = code('VoiceCaptureModule.kt');
    expect(count(module, 'askForPermissions(')).toBe(1);
    expect(count(module, 'askMicrophone {')).toBe(1);
    expect(bodyOf(module, 'private fun start(')).toContain('askMicrophone {');
    expect(bodyOf(module, 'private fun transcribeFile(')).not.toContain('askMicrophone');
    expect(bodyOf(module, 'private fun localRecognitionStatus(')).not.toContain('askMicrophone');
  });

  it('throws away a read-back if anything is recording while it runs', () => {
    const watch = bodyOf(code('VoiceCaptureModule.kt'), 'private fun watchMicrophone()');
    expect(watch).toContain('activeRecordingConfigurations.isNotEmpty()');
    expect(watch).toContain('settle("busy")');
  });

  it('asks for the microphone and nothing that reaches the network', () => {
    const manifest = fs.readFileSync(path.join(DIR, 'AndroidManifest.xml'), 'utf8');
    const permissions = [...manifest.matchAll(/uses-permission android:name="([^"]+)"/g)].map((m) => m[1]);
    expect(permissions).toEqual(['android.permission.RECORD_AUDIO']);
  });
});
