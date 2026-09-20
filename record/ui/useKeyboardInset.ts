/**
 * The keyboard as the temporary lower boundary of the Record.
 *
 * When the keyboard is up it does not cover the edge — it *becomes* the bottom of the
 * screen, and everything the Record draws sits above it. The edge is still the edge: the
 * same caret, the same field, the same circle, in the same relationship to the material
 * above it. Nothing floats, nothing opens, nothing becomes a composer.
 *
 * Two things make this work rather than merely move:
 *
 *   * the record is an **inverted** list, so index 0 is pinned to the bottom of whatever
 *     viewport it is given. Contracting the viewport therefore keeps the newest material
 *     against the edge and leaves the scroll position where it was — the anchor is stable
 *     for free, instead of being restored afterwards;
 *   * the animation is driven by the keyboard's **own** duration and curve, taken from the
 *     `keyboardWillShow` event, so the surface and the keyboard move as one object rather
 *     than as two things that happen to start at the same time.
 *
 * `keyboardWillChangeFrame` is listened to as well, which is what fires during an
 * interactive (drag-to-dismiss) gesture on iOS and during a height change when a hardware
 * keyboard connects or a suggestion bar appears.
 */

import { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  Platform,
  type EasingFunction,
} from 'react-native';

/**
 * iOS reports its own curve as an integer; the two we see in practice are 7 (the private
 * keyboard curve) and the standard ease-in-out. Both are close enough to this bezier that
 * the surface and the keyboard stay together for the whole move.
 */
const KEYBOARD_EASING: EasingFunction = Easing.bezier(0.17, 0.59, 0.4, 0.99);

/** How far the bottom of the usable surface has risen. Animated, so it can drive layout. */
export function useKeyboardInset(): Animated.Value {
  // Seeded from the keyboard's current height rather than from zero. A surface that opens
  // while the keyboard is already up — Focus, reached by tapping a moment with the field
  // still in hand — is never told `keyboardWillShow`, because the keyboard did not show; it
  // was already there. Starting at zero put that surface's own bottom bar under it.
  const inset = useRef(new Animated.Value(Keyboard.metrics()?.height ?? 0)).current;

  useEffect(() => {
    const animate = (toValue: number, duration: number) => {
      Animated.timing(inset, {
        toValue,
        // 250ms is what iOS uses when it does not say; a zero duration would snap.
        duration: duration > 0 ? duration : 250,
        easing: KEYBOARD_EASING,
        // Layout, not transform: the record's viewport genuinely contracts, so its content
        // reflows rather than being slid out of sight.
        useNativeDriver: false,
      }).start();
    };

    const subscriptions = [
      Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
        (event) => animate(event.endCoordinates.height, event.duration ?? 0)
      ),
      Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
        (event) => animate(0, event?.duration ?? 0)
      ),
    ];

    if (Platform.OS === 'ios') {
      // Fires during an interactive dismissal and whenever the keyboard changes height
      // without showing or hiding — a suggestion bar appearing, a hardware keyboard
      // connecting. Without it the edge would sit at the old height until the gesture ended.
      subscriptions.push(
        Keyboard.addListener('keyboardWillChangeFrame', (event) => {
          // `screenY` is the keyboard's top edge. Below the screen means hidden, which
          // arithmetic already gives as zero.
          const screenHeight = Dimensions.get('screen').height;
          animate(Math.max(0, screenHeight - event.endCoordinates.screenY), event.duration ?? 0);
        })
      );
    }

    return () => subscriptions.forEach((s) => s.remove());
  }, [inset]);

  return inset;
}

/** Puts the keyboard away. Used where a gesture should not be typing — holding to speak. */
export function dismissKeyboard(): void {
  Keyboard.dismiss();
}
