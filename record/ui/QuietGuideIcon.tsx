import React from 'react';
import { Text } from 'react-native';
import { useRecordAppearance, useRecordTheme } from './appearance';
import { type } from './type';

export function QuietGuideIcon() {
  const { bandLabel } = useRecordTheme();
  const { contrast } = useRecordAppearance();
  return (
    <Text accessible={false} style={[type({ size: 16, width: 94, color: bandLabel.color }),
      { opacity: contrast ? 1 : 0.82 }]}>quiet /</Text>
  );
}
