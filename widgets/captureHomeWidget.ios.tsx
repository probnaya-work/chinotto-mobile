/**
 * iOS home screen widget (Expo Widgets alpha). Isolated entry: safe to adjust or remove
 * if the alpha API changes. Renders only in the widget extension bundle — not in Expo Go.
 */
import { Text, VStack } from '@expo/ui/swift-ui';
import {
  background,
  font,
  foregroundStyle,
  padding,
  shapes,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';
import type { WidgetEnvironment } from 'expo-widgets';

import { CHINOTTO_WIDGET_CAPTURE_URL } from './chinottoWidgetConstants';

/** Same base as app shell / splash so the widget reads as Chinotto, not default iOS white. */
const WIDGET_SURFACE = '#141416';

function CaptureHomeWidget(_props: Record<string, never>, _env: WidgetEnvironment) {
  'widget';
  return (
    <VStack
      spacing={6}
      modifiers={[
        widgetURL(CHINOTTO_WIDGET_CAPTURE_URL),
        padding({ all: 14 }),
        background(WIDGET_SURFACE, shapes.roundedRectangle({ cornerRadius: 16, roundedCornerStyle: 'continuous' })),
      ]}
    >
      <Text modifiers={[font({ size: 14, weight: 'semibold' }), foregroundStyle('#d4d3ce')]}>
        Chinotto
      </Text>
      <Text modifiers={[font({ size: 13, weight: 'regular' }), foregroundStyle('#8f8e89')]}>
        Capture
      </Text>
    </VStack>
  );
}

export const captureHomeWidget = createWidget('CaptureHomeWidget', CaptureHomeWidget);
