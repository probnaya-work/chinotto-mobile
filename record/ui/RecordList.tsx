/**
 * The record itself: one inverted, virtualized list.
 *
 * Inverted because the edge is at the bottom. `FlatList inverted` draws index 0 lowest and
 * starts scrolled to it, which is exactly the prototype's `column-reverse` scroller — the
 * newest material rests against the capture field and the record recedes upward.
 *
 * Virtualized because the record is unbounded. Every band the prototype draws is drawn, with
 * no caps and no "N more"; only the mounted window is bounded. That is the whole of
 * decision 2.1–2.2, and it is why the rows arrive pre-flattened: a band cannot be a list
 * item, because a band can be four hundred moments long.
 */

import React, { useCallback } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';

import { HeldRow, MomentRow } from './MomentRow';
import { bandLabel, frame, ink, rule } from './tokens';
import { face, type } from './type';
import type { Row } from './rows';
import { yearBarHeight, type YearSummary } from '../model/bands';
import { dayLabel } from '../model/time';
import type { Material } from '../model/material';

export type RecordListProps = {
  rows: Row[];
  now: number;
  /** Phrases to highlight across every row — a Find query, or a Return's matched words. */
  highlight?: (string | null)[];

  selectedId: string | null;
  justSavedId: string | null;
  editSecondsLeft: number;
  continuationOffer: { text: string } | null;
  playingId: string | null;
  heldIds: Set<string>;
  /** `id -> { length, startedAt }` for the D0 rows that belong to a Line. */
  lines: Record<string, { length: number; startedAt: number }>;

  onTapMoment: (material: Material, tier: number) => void;
  onPlay: (material: Material) => void;
  onContinue: (material: Material) => void;
  onHold: (material: Material) => void;
  onCorrect: (material: Material) => void;
  onRemove: (material: Material) => void;
  onAcceptContinuation: () => void;
  onRejectContinuation: () => void;
  onOpenYears: () => void;
  onStandInYear: (year: number) => void;

  renderReturn: () => React.ReactElement | null;
  renderFindEmpty: () => React.ReactElement | null;

  /**
   * How far the keyboard has raised the floor. The record's viewport contracts by exactly
   * this much — it does not scroll, slide or get covered.
   *
   * Because the list is inverted, index 0 stays pinned to the bottom of whatever viewport
   * it is given. Contracting the viewport therefore keeps the newest material against the
   * edge and leaves the scroll offset untouched, so there is nothing to restore afterwards
   * and nothing jumps.
   */
  keyboardInset: Animated.Value;

  /** Whether the edge has a circle to talk into. The empty record only offers what exists. */
  voice?: boolean;

  /**
   * How much room the edge is taking right now, measured rather than assumed.
   *
   * `frame.bottom` is the height of the quietest possible edge — one empty row. The edge
   * grows with every notice stacked above it and with every line the capture field gains,
   * and it is opaque and in front, so reserving the constant meant the newest material was
   * simply covered: a moment would be cut off mid-line with the undo notice sitting under
   * the cut. Measuring it is the whole fix; nothing here scrolls or jumps.
   */
  edgeHeight?: number;
};

export function RecordList(props: RecordListProps) {
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Row>) => {
      switch (item.kind) {
        case 'return':
          return props.renderReturn();

        case 'findEmpty':
          return props.renderFindEmpty();

        case 'held':
          return (
            <HeldRow
              material={item.material}
              dayLabel={dayLabel(item.material.at, props.now)}
              onOpen={() => props.onTapMoment(item.material, 0)}
              onRelease={() => props.onHold(item.material)}
            />
          );

        case 'empty':
          return (
            <Text
              style={type({
                size: 20,
                width: 100,
                lineHeight: 1.3,
                tracking: -0.01,
                color: ink.meta,
              })}
            >
              {props.voice === false
                ? 'type anything. it lands here, and stays.'
                : 'type anything, or hold the circle and talk. it lands here, and stays.'}
            </Text>
          );

        case 'moment':
          return (
            <MomentRow
              material={item.material}
              tier={item.tier}
              gap={item.gap}
              now={props.now}
              highlight={props.highlight}
              selected={props.selectedId === item.material.id}
              justSaved={props.justSavedId === item.material.id}
              editSecondsLeft={props.editSecondsLeft}
              continuationOffer={
                props.justSavedId === item.material.id ? props.continuationOffer : null
              }
              playing={props.playingId === item.material.id}
              held={props.heldIds.has(item.material.id)}
              lineLength={props.lines[item.material.id]?.length}
              lineStartedAt={props.lines[item.material.id]?.startedAt}
              onTap={() => props.onTapMoment(item.material, item.tier)}
              onPlay={() => props.onPlay(item.material)}
              onContinue={() => props.onContinue(item.material)}
              onHold={() => props.onHold(item.material)}
              onCorrect={() => props.onCorrect(item.material)}
              onRemove={() => props.onRemove(item.material)}
              onAcceptContinuation={props.onAcceptContinuation}
              onRejectContinuation={props.onRejectContinuation}
            />
          );

        case 'bandLabel':
          return (
            <Pressable
              onPress={item.opensYears ? props.onOpenYears : undefined}
              disabled={!item.opensYears}
              accessibilityRole={item.opensYears ? 'button' : 'header'}
            >
              <Text
                style={{
                  fontFamily: face(90),
                  fontSize: bandLabel.size,
                  color: bandLabel.color,
                  letterSpacing: bandLabel.letterSpacing,
                  textTransform: 'uppercase',
                  marginBottom: bandLabel.marginBottom,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );

        case 'years':
          return <YearsBand years={item.years} onPress={props.onStandInYear} />;

        case 'begins':
          return (
            <Text
              style={[
                type({ size: 12, width: 90, color: ink.faint }),
                { marginBottom: 22 },
              ]}
            >
              {`the record begins here · ${item.label}`}
            </Text>
          );
      }
    },
    [props]
  );

  return (
    // The viewport. Its floor rises with the keyboard; the list inside simply fills it, so
    // the list itself never learns about keyboards and its scroll offset is never touched.
    <Animated.View
      testID="record-viewport"
      style={{
        position: 'absolute',
        // Full width, with the gutter as content padding rather than as the viewport's
        // edge. A scroll view clips to its bounds, so a selected row's wash — which is
        // meant to bleed past the words and read as a band of the surface — was being cut
        // off exactly at the text, leaving a rectangle with the words jammed against it.
        // Inside the padding it has somewhere to bleed into.
        left: 0,
        right: 0,
        top: frame.top,
        bottom: Animated.add(
          props.keyboardInset,
          new Animated.Value(Math.max(frame.bottom, props.edgeHeight ?? frame.bottom))
        ),
      }}
    >
      <FlatList
        inverted
        data={props.rows}
        renderItem={renderItem}
        keyExtractor={keyOf}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: frame.side }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // Dragging down through the record puts the keyboard away, tracking the finger.
        keyboardDismissMode="interactive"
        // Tuned so a chunk is always measured before it can be seen. The record is arranged
        // by distance and standing re-measures from where you stand, so it cannot be paged —
        // the whole thing is in the list and only the window is mounted.
        initialNumToRender={24}
        maxToRenderPerBatch={24}
        windowSize={11}
        updateCellsBatchingPeriod={40}
        removeClippedSubviews
      />
    </Animated.View>
  );
}

const keyOf = (row: Row) => row.key;

/**
 * The years band inside the record: a row per year with its months as density bars.
 *
 * The bars are absolute, not scaled to each year's own busiest month, so a bar means the
 * same thing in 2021 as in 2026 and the years are comparable at a glance.
 */
function YearsBand({
  years,
  onPress,
}: {
  years: YearSummary[];
  onPress: (year: number) => void;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      {/* Newest year lowest, matching the band's own reversal. */}
      {[...years].reverse().map((y) => (
        <Pressable
          key={y.y}
          onPress={() => onPress(y.y)}
          style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 6 }}
          accessibilityRole="button"
          accessibilityLabel={`${y.y}, ${y.count} moments`}
        >
          <Text style={type({ size: 12, width: 90, color: ink.meta })}>{y.y}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 12 }}>
            {y.months.map((count, i) => (
              <View
                key={i}
                style={{
                  width: 4,
                  height: yearBarHeight.inline(count),
                  backgroundColor: count ? ink.faint : rule.line,
                }}
              />
            ))}
          </View>
          <Text
            style={[type({ size: 12, width: 90, color: ink.meta }), { marginLeft: 'auto' }]}
          >
            {y.count}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
