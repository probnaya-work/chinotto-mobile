/**
 * What arrived from somewhere else, before it lands.
 *
 * The one place the app shows something it did not capture itself, so it says exactly what
 * it has: where it came from, what the source calls itself, the passage that was selected,
 * and whether this source has been met before. Then it asks for a word about it — and takes
 * "not really" for an answer, because a link with nothing said about it is still a complete
 * fragment.
 *
 * `you met this site before · mar 2024, sep 2025` is computed offline from `url_key`. It is
 * not a search and it does not guess: either the record has met this exact source or it has
 * not.
 */

import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Mark } from './Mark';
import { ink, rule, SURFACE } from './tokens';
import { face, type } from './type';

export type ShareSurfaceProps = {
  /** What the source calls itself, when it said. */
  title: string | null;
  domain: string | null;
  /** The passage the source supplied, if any. Shown on a rail, as its words. */
  selectedText: string | null;
  /** Plain text shared from somewhere with no link at all. */
  text: string | null;
  /** `you met this site before · mar 2024` — or the first time. */
  metBefore: string;
  /** Where it came from, when the share path said. */
  fromLabel: string;

  words: string;
  onChangeWords: (text: string) => void;
  onLeaveIt: () => void;
  onNotNow: () => void;
};

export function ShareSurface(props: ShareSurfaceProps) {
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: SURFACE,
        zIndex: 6,
      }}
    >
      <View style={{ position: 'absolute', left: 24, right: 24, top: 110, gap: 26 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Mark size={20} color={ink.meta} />
          <Text style={type({ size: 12, width: 90, color: ink.meta })}>{props.fromLabel}</Text>
        </View>

        <View style={{ gap: 8 }}>
          <Text
            style={type({ size: 22, width: 100, lineHeight: 1.3, tracking: -0.01, color: ink.ink })}
          >
            {/* Enrichment is derived and may never arrive; the URL is what actually came. */}
            {props.title ?? props.domain ?? props.text ?? 'a link'}
          </Text>
          {props.domain ? (
            <Text style={type({ size: 14, width: 90, color: ink.meta })}>{props.domain}</Text>
          ) : null}
        </View>

        {props.selectedText ? (
          <View
            style={{ paddingLeft: 14, borderLeftWidth: 2, borderLeftColor: rule.line }}
          >
            <Text style={type({ size: 15, width: 100, lineHeight: 1.4, color: ink.far })}>
              {`“${props.selectedText}”`}
            </Text>
            {/* Named, so it is never mistaken for something the person wrote. */}
            <Text style={[type({ size: 12, width: 90, color: ink.meta }), { marginTop: 6 }]}>
              text you selected
            </Text>
          </View>
        ) : null}

        <View style={{ paddingTop: 22, borderTopWidth: 1, borderTopColor: rule.hair }}>
          <Text style={type({ size: 12, width: 90, color: ink.meta })}>{props.metBefore}</Text>
        </View>
      </View>

      <View style={{ position: 'absolute', left: 24, right: 24, bottom: 40, gap: 18 }}>
        <TextInput
          accessibilityLabel="a word about it, or not"
          multiline
          value={props.words}
          onChangeText={props.onChangeWords}
          placeholder="a word about it, or not"
          placeholderTextColor={ink.placeholder}
          selectionColor={ink.ink}
          style={[
            type({ size: 22, width: 100, lineHeight: 1.3, tracking: -0.01 }),
            { color: ink.ink, maxHeight: 160 },
          ]}
        />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable
            onPress={props.onLeaveIt}
            accessibilityRole="button"
            style={{
              flex: 1,
              height: 56,
              backgroundColor: ink.ink,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: face(92), fontSize: 16, color: SURFACE }}>leave it</Text>
          </Pressable>
          <Pressable
            onPress={props.onNotNow}
            accessibilityRole="button"
            style={{
              height: 56,
              paddingHorizontal: 20,
              borderWidth: 1,
              borderColor: ink.faint,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: face(92), fontSize: 15, color: ink.verb }}>not now</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/**
 * `you met this site before · mar 2024, sep 2025` — from the record, offline, or the plain
 * truth that this is the first time.
 */
export function metBeforeLabel(months: string[]): string {
  if (months.length === 0) return 'first time here';
  const distinct = [...new Set(months)].slice(0, 3);
  return `you met this site before · ${distinct.join(', ')}`;
}
