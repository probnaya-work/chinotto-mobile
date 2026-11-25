import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { useRecordTheme } from './appearance';

export function QuietGuideIcon({ size = 24 }: { size?: number }) {
  const { bandLabel } = useRecordTheme();
  return <Svg accessible={false} width={size} height={size} viewBox="0 0 28 28" fill="none">
    <Path d="M14 7C10 4.6 6.5 4.7 3 5.4v16c3.8-.8 7.3-.3 11 1.8 3.7-2.1 7.2-2.6 11-1.8v-16C21.5 4.7 18 4.6 14 7Zm0 0v16"
      stroke={bandLabel.color} strokeWidth={1.5} strokeLinejoin="round" />
    <Circle cx={19.5} cy={11} r={2} fill={bandLabel.color} />
  </Svg>;
}
