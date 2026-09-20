/**
 * The launch lockup.
 *
 * The three dots arrive from below, one after another; the ring closes around them; the
 * wordmark rises. Then it leaves — the dots scatter back the way they came, the ring opens
 * and the record is already there underneath.
 *
 * **It never gates capture.** This is the resolution of the one place the prototype and
 * `AGENTS.md` genuinely contradict each other (handoff §1.1, decisions 1.1–1.4):
 *
 *   * it plays on a **cold start only**, never on a warm resume;
 *   * it is `pointerEvents="none"`, and the capture field beneath it is already mounted and
 *     focused, so nothing is waiting on it;
 *   * **any touch or keystroke dismisses it at once** — the moment somebody wants to type,
 *     the identity moment is over.
 *
 * Under reduced motion there is no choreography: the lockup is simply held, briefly, and
 * then crossfades.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

import { Mark } from './Mark';
import { ink, motion, SURFACE } from './tokens';
import { type } from './type';

export type LaunchProps = {
  /** Drives the exit. The caller decides when, and why. */
  leaving: boolean;
  onFinished: () => void;
  reducedMotion: boolean;
};

const EASE = Easing.bezier(...motion.bezier);

/** The ring closes around the dots once they have arrived. */
const RING = { delay: 1020, duration: 900 } as const;
/** The word is the last thing to arrive, and the lockup is not finished until it has. */
const WORD = { delay: 1500, duration: 800 } as const;
/** A beat to see the whole thing before the record takes over. */
const LOCKUP_BEAT = 500;

/** Where each dot comes from, and where it scatters back to. */
const DOT_ORIGINS = [
  { x: -9, y: 30, scale: 0.35, delay: 120, duration: 620 },
  { x: -15, y: 44, scale: 0.3, delay: 300, duration: 800 },
  { x: -21, y: 58, scale: 0.25, delay: 460, duration: 980 },
] as const;

export function Launch({ leaving, onFinished, reducedMotion }: LaunchProps) {
  // 0 → nothing has arrived, 1 → fully arrived.
  const dots = useRef(DOT_ORIGINS.map(() => new Animated.Value(0))).current;
  const ring = useRef(new Animated.Value(0)).current;
  const word = useRef(new Animated.Value(0)).current;
  const out = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      dots.forEach((d) => d.setValue(1));
      ring.setValue(1);
      word.setValue(1);
      return;
    }
    const animations = [
      ...dots.map((value, i) =>
        Animated.timing(value, {
          toValue: 1,
          duration: DOT_ORIGINS[i].duration,
          delay: DOT_ORIGINS[i].delay,
          easing: EASE,
          useNativeDriver: true,
        })
      ),
      Animated.timing(ring, {
        toValue: 1,
        duration: RING.duration,
        delay: RING.delay,
        easing: EASE,
        useNativeDriver: true,
      }),
      Animated.timing(word, {
        toValue: 1,
        duration: WORD.duration,
        delay: WORD.delay,
        easing: EASE,
        useNativeDriver: true,
      }),
    ];
    Animated.parallel(animations).start();
    return () => animations.forEach((a) => a.stop());
  }, [dots, ring, word, reducedMotion]);

  useEffect(() => {
    if (!leaving) return;
    const duration = reducedMotion ? 200 : motion.launchOut;
    const animation = Animated.timing(out, {
      toValue: 1,
      duration,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) onFinished();
    });
    return () => animation.stop();
  }, [leaving, out, onFinished, reducedMotion]);

  const fadeOut = out.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Animated.View
      // Nothing here is touchable. The record and its capture field are live underneath.
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: SURFACE,
        zIndex: 20,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fadeOut,
      }}
    >
      <View style={{ width: 94, height: 94, marginBottom: 26 }}>
        <Animated.View
          style={{
            position: 'absolute',
            inset: 0,
            opacity: ring,
            transform: [
              {
                scale: Animated.add(
                  ring.interpolate({ inputRange: [0, 1], outputRange: [1.35, 1] }),
                  out.interpolate({ inputRange: [0, 1], outputRange: [0, 0.22] })
                ),
              },
            ],
          }}
        >
          {/* Stroke 2 at 94pt: the lockup draws a finer ring than the icon does. */}
          <Mark size={94} rung="full" strokeWidth={2} color={ink.ink} />
        </Animated.View>

        {DOT_ORIGINS.map((origin, i) => (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: Animated.multiply(
                dots[i],
                out.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
              ),
              transform: [
                {
                  translateX: Animated.add(
                    dots[i].interpolate({ inputRange: [0, 1], outputRange: [origin.x, 0] }),
                    out.interpolate({ inputRange: [0, 1], outputRange: [0, origin.x * 0.86] })
                  ),
                },
                {
                  translateY: Animated.add(
                    dots[i].interpolate({ inputRange: [0, 1], outputRange: [origin.y, 0] }),
                    out.interpolate({ inputRange: [0, 1], outputRange: [0, origin.y * 0.86] })
                  ),
                },
                {
                  scale: Animated.add(
                    dots[i].interpolate({ inputRange: [0, 1], outputRange: [origin.scale, 1] }),
                    out.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, origin.scale - 1],
                    })
                  ),
                },
              ],
            }}
          >
            <Dot index={i} />
          </Animated.View>
        ))}
      </View>

      {/* The wordmark rises out of a clipped box, so it appears from nothing. */}
      <View style={{ overflow: 'hidden', paddingBottom: 5 }}>
        <Animated.Text
          style={[
            type({ size: 34, width: 96, weight: 500, lineHeight: 1, tracking: -0.022, color: ink.ink }),
            {
              opacity: Animated.multiply(word, fadeOut),
              transform: [
                {
                  translateY: Animated.add(
                    word.interpolate({ inputRange: [0, 1], outputRange: [34, 0] }),
                    out.interpolate({ inputRange: [0, 1], outputRange: [0, -10] })
                  ),
                },
              ],
            },
          ]}
        >
          chinotto
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

/**
 * One dot of the mark, drawn on its own so it can move independently of the ring.
 * The geometry matches `Mark`'s `full` rung exactly: 8 @ 23, 4.5 @ 38, 2.5 @ 47.5 in a
 * 64-unit box scaled to 94.
 */
function Dot({ index }: { index: number }) {
  const GEOMETRY = [
    { cy: 23, r: 8 },
    { cy: 38, r: 4.5 },
    { cy: 47.5, r: 2.5 },
  ][index];
  const unit = 94 / 64;
  const size = GEOMETRY.r * 2 * unit;
  return (
    <View
      style={{
        position: 'absolute',
        left: 94 / 2 - size / 2,
        top: GEOMETRY.cy * unit - size / 2,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: ink.ink,
      }}
    />
  );
}

/**
 * How long the lockup holds before it leaves on its own.
 *
 * The prototype's own prop default is 1.9s, and the hold is reduced by however long the app
 * has already spent loading — so a slow start never *adds* to the wait, it eats into it.
 */
/** When the lockup has finished assembling itself, and how long it then rests. */
export const LAUNCH_HOLD = WORD.delay + WORD.duration + LOCKUP_BEAT;

export function launchHoldFor(loadedAtMs: number, now: number, reducedMotion: boolean): number {
  // Derived rather than chosen: the hold used to be 1900, which began dismissing the lockup
  // while the word was still 83% of the way in — it was cut off mid-sentence every time.
  // Now it is however long the last thing takes to arrive, plus a beat to see it whole.
  const full = reducedMotion ? motion.launchReducedHold : LAUNCH_HOLD;
  return Math.max(0, full - (now - loadedAtMs));
}
