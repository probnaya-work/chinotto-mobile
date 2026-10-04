/**
 * Room for the system's own bars, on Android.
 *
 * The Record's geometry is the iPhone prototype's: 54pt reserved at the top for the status
 * bar, and bottom paddings (the edge's 40, focus's 44, …) that already clear a 34pt home
 * indicator. Android draws edge-to-edge too, but its bars are not those sizes — above all the
 * three-button navigation bar, 48dp tall, which would sit over the capture circle.
 *
 * Rather than re-deriving every surface's padding, the whole Record is framed: on Android it
 * is lifted by however much the system's bars exceed what the design already leaves them, and
 * the ink field runs on behind the bars. Every overlay is positioned inside that frame, so
 * they all clear the bars at once. Where the bars fit inside the design's own allowance —
 * gesture navigation, an ordinary status bar — the frame is zero and nothing moves.
 *
 * On iOS none of this is mounted: no provider, no frame, the same tree as before.
 */

import React, { useContext } from 'react';
import { Platform, View } from 'react-native';
import {
  initialWindowMetrics,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  type EdgeInsets,
} from 'react-native-safe-area-context';

import { SURFACE } from './tokens';

/** What the design already leaves the status bar, in points. `frame.statusBarHeight`. */
export const DESIGN_TOP_ALLOWANCE = 54;
/** The home indicator the design's bottom paddings already clear, in points. */
export const DESIGN_BOTTOM_ALLOWANCE = 34;

export type FrameInsets = { top: number; bottom: number };

const NONE: FrameInsets = { top: 0, bottom: 0 };

/** How far the frame is lifted at each end: only what the design does not already allow for. */
export function frameInsetsFor(system: Pick<EdgeInsets, 'top' | 'bottom'> | null): FrameInsets {
  if (!system) return NONE;
  return {
    top: Math.max(0, system.top - DESIGN_TOP_ALLOWANCE),
    bottom: Math.max(0, system.bottom - DESIGN_BOTTOM_ALLOWANCE),
  };
}

/**
 * The system's bottom bar and the frame's lift, for the keyboard.
 *
 * React Native on Android reports the keyboard's height *without* the navigation bar under
 * it, so the keyboard's top is `keyboard + systemBottom` above the screen's bottom — and the
 * frame's bottom is already `frame.bottom` above it. The edge has to rise by the difference.
 * Zero everywhere else, which is the iOS arithmetic unchanged.
 */
export function useKeyboardBase(): number {
  const system = useContext(SafeAreaInsetsContext);
  if (Platform.OS !== 'android' || !system) return 0;
  return system.bottom - frameInsetsFor(system).bottom;
}

function AndroidFrame({ children }: { children: React.ReactNode }) {
  const inset = frameInsetsFor(useContext(SafeAreaInsetsContext));
  return (
    <View style={{ flex: 1, backgroundColor: SURFACE }}>
      <View style={{ flex: 1, marginTop: inset.top, marginBottom: inset.bottom }}>{children}</View>
    </View>
  );
}

/** Wraps the app. A pass-through anywhere but Android. */
export function SystemFrame({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'android') return <>{children}</>;
  return (
    // Seeded from the window's metrics, because the provider otherwise renders nothing until
    // it has measured — and nothing is allowed in front of the capture field, not even a frame.
    <SafeAreaProvider
      initialMetrics={initialWindowMetrics}
      style={{ flex: 1, backgroundColor: SURFACE }}
    >
      <AndroidFrame>{children}</AndroidFrame>
    </SafeAreaProvider>
  );
}
