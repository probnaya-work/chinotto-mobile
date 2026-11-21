import React from 'react';
import { Button, Host, Image, Menu } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonStyle, contentShape, frame, shapes } from '@expo/ui/swift-ui/modifiers';
import { useRecordTheme } from './appearance';
import type { ThoughtActionsMenuProps } from './ThoughtActionsMenu';

const symbols = { reminder: 'bell', quiet: 'book', connection: 'link' } as const;
const triggerFrame = frame({ width: 44, height: 44 });
const triggerModifiers = [triggerFrame, contentShape(shapes.rectangle())];
const menuModifiers = [buttonStyle('plain'), accessibilityLabel('thought actions')];

export function ThoughtActionsMenu({ actions }: ThoughtActionsMenuProps) {
  const { mode, ink } = useRecordTheme();
  return (
    <Host colorScheme={mode} style={{ width: 44, height: 44 }}>
      <Menu
        label={
          <Image systemName="ellipsis" size={19} color={ink.far}
            modifiers={triggerModifiers} />
        }
        modifiers={menuModifiers}
      >
        {actions.map((action) => (
          <Button key={action.id} label={action.label} systemImage={symbols[action.id]} onPress={action.onPress} />
        ))}
      </Menu>
    </Host>
  );
}
