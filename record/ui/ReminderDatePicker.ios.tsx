import React from 'react';
import { DatePicker, Host } from '@expo/ui/swift-ui';
import { useRecordTheme } from './appearance';
import type { ReminderDatePickerProps } from './ReminderDatePicker';

export function ReminderDatePicker({ at, onChange }: ReminderDatePickerProps) {
  const { mode } = useRecordTheme();
  return (
    <Host matchContents={{ vertical: true }} colorScheme={mode}>
      <DatePicker
        title="date and time"
        selection={new Date(at)}
        displayedComponents={['date', 'hourAndMinute']}
        onDateChange={(value) => onChange(value.getTime())}
      />
    </Host>
  );
}
