/**
 * A moment in the record.
 *
 * Two shapes, both here because they are the same row seen from different distances:
 *
 *   * **D0** — full size, up to four lines, and the only tier you can act on in place. One
 *     tap selects it and opens an inline verb row; a second tap opens it.
 *   * **D1–D4** — compact, clamped, and a single tap opens focus. There is nothing to act on
 *     at a distance: you go to the moment first.
 *
 * The verb row is inline, under the text, and never a popover or a sheet. The prototype is
 * explicit about that, and it matters: a popover would cover the material you are deciding
 * about.
 */

import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Marked } from './Marked';
import { bandGap, tierClamp, tierTextStyle, voiceChip } from './tiers';
import { ink, rule, wash } from './tokens';
import { face, type } from './type';
import type { Tier } from '../model/bands';
import {
  displayText,
  firstLine,
  hasNoWordsYet,
  isQuoteOnly,
  isVoice,
  paragraphCount,
  type Material,
} from '../model/material';
import { fmtDur, monthLabel } from '../model/time';
import { parts, type TextPart } from '../model/words';

const metaStyle = type({ size: 12, width: 90, lineHeight: 1.3, color: ink.meta });

export type MomentRowProps = {
  material: Material;
  tier: Tier;
  gap: number;
  /** Phrases to highlight — a Find query, or a Return's matched run. */
  highlight?: (string | null)[];
  /** D0 only. */
  selected?: boolean;
  /** D0 only: the twelve seconds after it landed. */
  justSaved?: boolean;
  editSecondsLeft?: number;
  continuationOffer?: { text: string } | null;
  /** How long this moment's Line is, when it is part of one. */
  lineLength?: number;
  lineStartedAt?: number;
  now: number;
  playing?: boolean;

  onTap: () => void;
  onPlay?: () => void;
  onContinue?: () => void;
  onHold?: () => void;
  onCorrect?: () => void;
  onRemove?: () => void;
  onAcceptContinuation?: () => void;
  onRejectContinuation?: () => void;
  held?: boolean;
};

/** `▶ 0:42`, or `■ 0:42` while it is playing. Voice is material, not an attachment. */
function VoiceChip({
  material,
  compact,
  playing,
  onPlay,
}: {
  material: Material;
  compact: boolean;
  playing?: boolean;
  onPlay?: () => void;
}) {
  const seconds = Math.round((material.durationMs ?? 0) / 1000);
  const spec = compact ? voiceChip.compact : voiceChip.d0;
  const label = material.audioMissing
    ? 'audio gone'
    : `${playing ? '■' : '▶'} ${fmtDur(seconds)}`;

  const chip = (
    <Text
      style={{
        fontFamily: face(90),
        fontSize: spec.fontSize,
        color: material.audioMissing ? ink.meta : ink.verb,
        borderWidth: 1,
        borderColor: rule.line,
        paddingTop: spec.paddingTop,
        paddingBottom: spec.paddingBottom,
        paddingLeft: spec.paddingLeft,
        paddingRight: spec.paddingRight,
        marginRight: spec.marginRight,
        overflow: 'hidden',
      }}
    >
      {label}
    </Text>
  );

  // At a distance the chip states the duration but does not play: you open the moment first.
  if (compact || material.audioMissing || !onPlay) return chip;
  return (
    <Pressable onPress={onPlay} hitSlop={8}>
      {chip}
    </Pressable>
  );
}

/** `theatlantic.com · shared, no words yet` — what arrived, and what has not. */
function encounterMeta(material: Material): string | null {
  if (!material.url) return null;
  const domain = material.domain ?? 'a link';
  if (!hasNoWordsYet(material)) return domain;
  const shared = material.sourceApp === 'share' || material.method === 'shared' ? 'shared, ' : '';
  // Enrichment is derived and allowed to fail. When it has, the row says so rather than
  // leaving a blank where a title would be.
  if (material.enrichmentState === 'failed') return `${domain} · ${shared}no title`;
  if (material.enrichmentState === 'pending' && !material.title) {
    return `${domain} · ${shared}no words yet`;
  }
  return `${domain} · ${shared}no words yet`;
}

function metaFor(
  material: Material,
  lineLength: number | undefined,
  lineStartedAt: number | undefined,
  now: number
): string | null {
  const bits: string[] = [];
  const encounter = encounterMeta(material);
  if (encounter) bits.push(encounter);
  else if (lineLength && lineLength > 1 && lineStartedAt !== undefined) {
    bits.push(`↳ a line · ${lineLength} moments · since ${monthLabel(lineStartedAt, now, true)}`);
  }
  const paragraphs = paragraphCount(material);
  if (paragraphs > 1) bits.push(`${paragraphs - 1} more paragraphs`);
  return bits.length ? bits.join(' · ') : null;
}

function bodyParts(material: Material, tier: Tier, highlight?: (string | null)[]): TextPart[] {
  const text = displayText(material);
  // D0 shows the first paragraph and says how many more there are; the compact tiers
  // flatten newlines so a multi-paragraph moment is still one line.
  const shown = tier === 0 ? text.split(/\n\n+/)[0] : text.replace(/\n+/g, ' ');
  return parts(shown, highlight);
}

export function MomentRow(props: MomentRowProps) {
  const { material, tier, gap, now } = props;
  const compact = tier > 0;
  const voice = isVoice(material);
  const quote = isQuoteOnly(material);
  const borrowed = hasNoWordsYet(material);

  const textStyle = tierTextStyle(tier, { voice, borrowedWords: borrowed });
  const meta = compact ? null : metaFor(material, props.lineLength, props.lineStartedAt, now);

  const body = (
    <Marked
      parts={bodyParts(material, tier, props.highlight)}
      style={[
        textStyle,
        // The just-saved underline: still yours to change, and it shows.
        props.justSaved ? { textDecorationLine: 'underline', textDecorationColor: ink.meta } : null,
      ].filter(Boolean) as never}
      numberOfLines={tierClamp(tier, props.selected)}
    />
  );

  if (compact) {
    return (
      <Pressable onPress={props.onTap} style={{ marginBottom: gap }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          {voice ? <VoiceChip material={material} compact /> : null}
          <View style={{ flex: 1 }}>{body}</View>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={{ marginBottom: gap }}>
      <Pressable
        onPress={props.onTap}
        style={
          props.selected
            ? {
                backgroundColor: wash.selected,
                // The wash bleeds past the text to the frame's edge, so a selected row reads
                // as a band of the surface rather than as a highlighted paragraph.
                marginHorizontal: -16,
                paddingHorizontal: 16,
                paddingVertical: 12,
              }
            : undefined
        }
      >
        {quote ? (
          <Text
            style={[
              type({ size: 16, width: 100, lineHeight: 1.35, color: ink.far }),
              {
                paddingLeft: 12,
                borderLeftWidth: 2,
                borderLeftColor: rule.line,
                marginBottom: 8,
              },
            ]}
          >
            {`“${material.selectedText}”`}
          </Text>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          {voice ? (
            <VoiceChip
              material={material}
              compact={false}
              playing={props.playing}
              onPlay={props.onPlay}
            />
          ) : null}
          <View style={{ flex: 1 }}>{body}</View>
        </View>

        {meta ? <Text style={[metaStyle, { marginTop: 4 }]}>{meta}</Text> : null}

        {props.justSaved ? (
          <Text style={[metaStyle, { marginTop: 6, lineHeight: 18 }]}>
            {`still yours to change · ${props.editSecondsLeft ?? 0}s`}
            {props.continuationOffer ? (
              <Text>
                {' · continues '}
                <Text style={{ color: ink.verb }}>{`“${props.continuationOffer.text}”`}</Text>
                {'? '}
                <Text onPress={props.onAcceptContinuation} style={{ color: ink.ink }}>
                  yes
                </Text>
                {' · '}
                <Text onPress={props.onRejectContinuation}>no</Text>
              </Text>
            ) : null}
          </Text>
        ) : null}
      </Pressable>

      {props.selected ? (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <Verb label="continue" filled onPress={props.onContinue} />
          <Verb label={props.held ? 'release' : 'hold'} onPress={props.onHold} />
          <Verb label="correct" onPress={props.onCorrect} />
          <Verb label="×" narrow quiet onPress={props.onRemove} />
        </View>
      ) : null}
    </View>
  );
}

/** A 44pt target, which is the smallest thing a thumb should be asked to hit. */
function Verb({
  label,
  filled,
  narrow,
  quiet,
  onPress,
}: {
  label: string;
  filled?: boolean;
  narrow?: boolean;
  quiet?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label === '×' ? 'remove' : label}
      style={{
        flex: narrow ? undefined : 1,
        width: narrow ? 44 : undefined,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? ink.ink : 'transparent',
        borderWidth: filled ? 0 : 1,
        borderColor: ink.faint,
      }}
    >
      <Text
        style={{
          fontFamily: face(92),
          fontSize: 15,
          color: filled ? '#141416' : quiet ? ink.meta : ink.ink,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Kept present, above the record, with a rail and a way out. */
export function HeldRow({
  material,
  onOpen,
  onRelease,
  dayLabel,
}: {
  material: Material;
  onOpen: () => void;
  onRelease: () => void;
  /** When it was captured, in the record's own words — `today`, `12 mar`. */
  dayLabel: string;
}) {
  return (
    <View style={{ position: 'relative', paddingLeft: 14, marginBottom: 18 }}>
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 2,
          bottom: 2,
          width: 2,
          backgroundColor: rule.line,
        }}
      />
      <Text
        onPress={onOpen}
        style={type({ size: 16, width: 100, lineHeight: 1.3, color: ink.near })}
      >
        {firstLine(material)}
      </Text>
      <Text style={[type({ size: 11, width: 90, color: ink.meta }), { marginTop: 2 }]}>
        {`held · from ${dayLabel} · `}
        <Text onPress={onRelease} style={{ color: ink.verb }}>
          release
        </Text>
      </Text>
    </View>
  );
}
