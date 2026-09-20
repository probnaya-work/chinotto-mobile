/**
 * The years, pinched out.
 *
 * Every year the record touches, as a row whose height falls away with distance and whose
 * months are density bars. Tapping a month stands you in it; tapping a year stands you in
 * the last month of it that holds anything.
 *
 * The bars are absolute rather than scaled to each year's own busiest month, so a tall bar
 * means the same thing in 2021 as in 2026. A per-year scale would make a quiet year look
 * exactly like a busy one, which is the opposite of what a density strip is for.
 */

import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { ink, rule, SURFACE } from './tokens';
import { type } from './type';
import { yearBarHeight } from '../model/bands';

export type YearRow = { y: number; months: number[]; count: number };

export type YearsOverlayProps = {
  years: YearRow[];
  onStandInMonth: (year: number, month: number) => void;
  onStandInYear: (year: number) => void;
  onClose: () => void;
};

export function YearsOverlay({
  years,
  onStandInMonth,
  onStandInYear,
  onClose,
}: YearsOverlayProps) {
  return (
    <Pressable
      onPress={onClose}
      accessibilityLabel="close the years"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: SURFACE,
        zIndex: 5,
      }}
    >
      <View style={{ height: 54 }} />

      <View
        style={{
          flex: 1,
          paddingHorizontal: 24,
          paddingTop: 36,
          // Newest at the bottom, nearest the thumb and nearest the edge you came from.
          flexDirection: 'column-reverse',
          justifyContent: 'flex-start',
        }}
      >
        {years.map((year, i) => (
          <Pressable
            key={year.y}
            onPress={() => onStandInYear(year.y)}
            accessibilityRole="button"
            accessibilityLabel={`stand in ${year.y}, ${year.count} moments`}
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              gap: 16,
              // Nearer years are given more room, so the strip reads as a perspective
              // rather than as a table.
              height: Math.max(48, 118 - i * 12),
              borderTopWidth: 1,
              borderTopColor: rule.hair,
            }}
          >
            <Text
              style={[
                type({
                  size: Math.max(12, 44 - i * 5),
                  width: 100,
                  tracking: -0.03,
                  color: i === 0 ? ink.ink : i < 3 ? ink.near : ink.meta,
                }),
                { width: 110 },
              ]}
            >
              {year.y}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 16 }}>
              {year.months.map((count, month) => (
                <Pressable
                  key={month}
                  disabled={count === 0}
                  onPress={() => onStandInMonth(year.y, month)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    count ? `stand in month ${month + 1} of ${year.y}` : undefined
                  }
                  // The bar itself is 6pt; the target around it is not.
                  hitSlop={{ top: 12, bottom: 12, left: 2, right: 2 }}
                >
                  <View
                    style={{
                      width: 6,
                      height: yearBarHeight.overlay(count),
                      backgroundColor: count ? ink.meta : rule.line,
                    }}
                  />
                </Pressable>
              ))}
            </View>

            <Text
              style={[type({ size: 12, width: 90, color: ink.meta }), { marginLeft: 'auto' }]}
            >
              {year.count}
            </Text>
          </Pressable>
        ))}
      </View>

      <View
        style={{
          paddingHorizontal: 24,
          paddingBottom: 40,
          height: 64,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <View style={{ width: 3, height: 32, backgroundColor: ink.ink }} />
        <Text style={type({ size: 14, width: 90, color: ink.meta })}>
          tap a month to stand there · tap outside to come back
        </Text>
      </View>
    </Pressable>
  );
}
