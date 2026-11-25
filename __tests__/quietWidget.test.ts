import * as fs from 'fs';
import * as path from 'path';
import { parseWidgetDeepLink } from '../widgets/parseWidgetDeepLink';

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'ios/ExpoWidgetsTarget/QuietCaptureWidget.swift'), 'utf8');

describe('the native Quiet widget contract', () => {
  it('opens text capture from the widget background and retains the voice and in-app links', () => {
    const links = [...source.matchAll(/URL\(string: "([^"]+)"\)/g)].map((match) => match[1]);
    expect(links.map(parseWidgetDeepLink)).toEqual([
      { type: 'quiet' },
      { type: 'capture', mode: 'default' },
      { type: 'capture', mode: 'voice' },
    ]);
    expect(source).toContain('Link(destination: quietURL)');
    expect(source).toContain('.widgetURL(textURL)');
    expect(source).toContain('Link(destination: textURL)');
    expect(source).toContain('Link(destination: voiceURL)');
  });

  it('ships beside the existing widget in the extension and Expo configuration', () => {
    const bundle = fs.readFileSync(path.join(root, 'ios/ExpoWidgetsTarget/index.swift'), 'utf8');
    expect(bundle).toContain('CaptureHomeWidget()');
    expect(bundle).toContain('QuietCaptureWidget()');
    const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
    const widgets = config.expo.plugins.find((plugin: unknown[]) => plugin[0] === 'expo-widgets')[1].widgets;
    expect(widgets).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'CaptureHomeWidget' }),
      expect.objectContaining({ name: 'QuietCaptureWidget', supportedFamilies: ['systemMedium', 'systemLarge'] }),
    ]));
    const project = fs.readFileSync(path.join(root, 'ios/Chinotto.xcodeproj/project.pbxproj'), 'utf8');
    expect(project).toContain('QuietCaptureWidget.swift in Sources');
  });

  it('uses the original Medium mark and the shared capture controls in both sizes', () => {
    expect(source).toContain('.supportedFamilies([.systemMedium, .systemLarge])');
    expect(source).toContain('ChinottoLogoMark(size: 12, scheme: .dark)');
    expect(source).toContain('.accessibilityLabel("What arrived? Write a thought")');
    expect(source).toContain('.accessibilityLabel("Record a thought")');
    expect(source).not.toContain('systemName: "mic"');
  });

  it('derives the Large calendar strip from the entry date without access to Record', () => {
    expect(source).toContain('calendar.dateInterval(of: .weekOfYear, for: date)');
    expect(source).toContain('calendar.isDate(day, inSameDayAs: date)');
    expect(source).not.toMatch(/UserDefaults|WidgetThought|readWidgetState|SQLite|FileManager|URLSession/);
  });
});
