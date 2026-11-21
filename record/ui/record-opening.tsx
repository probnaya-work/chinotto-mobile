import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { Mark } from './Mark';

/** The same quiet breath as the native privacy cover. It never owns the capture field. */
export function RecordOpening({ reducedMotion }: { reducedMotion: boolean }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    opacity.setValue(1);
    if (reducedMotion) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.52, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [opacity, reducedMotion]);
  return <Animated.View accessible accessibilityLabel="Opening the Record"
    accessibilityRole="progressbar" accessibilityState={{ busy: true }} pointerEvents="none"
    style={{ opacity, alignItems: 'center' }}>
    <Mark size={72} rung="full" strokeWidth={2} />
  </Animated.View>;
}
