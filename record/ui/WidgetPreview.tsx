/**
 * What the home screen widget looks like, shown from inside settings.
 *
 * Not the widget — a picture of it, so "home widget · capture, and the last thing you left"
 * can be seen rather than imagined before anyone goes to the home screen to add it. The
 * prototype draws it against a mock home screen for exactly that reason.
 *
 * Tapping the drawing does what tapping the widget does, which is the honest way to
 * demonstrate it: it closes settings and puts the caret in the field.
 */

import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Mark } from './Mark';
import { agency, ink, rule, SURFACE } from './tokens';
import { face, type } from './type';

export type WidgetPreviewProps = {
  /** The opening line of the last thing left, or `nothing yet`. */
  lastLine: string;
  /** `09:41` today, or `12 mar`. */
  lastWhen: string;
  onCapture: () => void;
  onSpeak: () => void;
  onClose: () => void;
};

export function WidgetPreview(props: WidgetPreviewProps) {
  return (
    <Pressable
      onPress={props.onClose}
      accessibilityLabel="close the widget preview"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(14,14,16,0.86)',
        zIndex: 8,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
      }}
    >
      <View style={{ width: '100%', gap: 18 }}>
        {/* A medium widget: two rows of the home grid. */}
        <Pressable
          onPress={props.onCapture}
          accessibilityRole="button"
          accessibilityLabel="capture"
          style={{
            backgroundColor: SURFACE,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: rule.line,
            padding: 16,
            gap: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Mark size={28} color={ink.ink} />
            <View style={{ flex: 1 }}>
              <Text style={type({ size: 17, width: 96, color: ink.ink })}>capture</Text>
              <Text style={type({ size: 12, width: 90, color: ink.meta })}>
                it lands, and stays
              </Text>
            </View>
            <Pressable
              onPress={props.onSpeak}
              accessibilityRole="button"
              accessibilityLabel="hold to speak"
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                borderWidth: 1.5,
                borderColor: ink.ink,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ink.ink }}
              />
            </Pressable>
          </View>

          <Text
            style={type({ size: 13, width: 90, lineHeight: 1.35, color: ink.far })}
            numberOfLines={2}
          >
            <Text style={{ color: ink.meta }}>{`${props.lastWhen} · `}</Text>
            {props.lastLine}
          </Text>
        </Pressable>

        {/* A small widget beside an app icon, for scale. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 14,
              backgroundColor: SURFACE,
              borderWidth: 1,
              borderColor: rule.line,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Mark size={37} color={ink.ink} />
          </View>
          <Text style={type({ size: 13, width: 90, color: ink.near })}>Chinotto</Text>
        </View>

        <Text style={type({ size: 12, width: 90, lineHeight: 1.4, color: ink.meta })}>
          home screen · medium widget · tap to capture, the circle to speak
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * The version of the app that can no longer open the record safely.
 *
 * The one genuinely blocking surface in the product, and it earns it: a build whose schema is
 * older than the database has no safe way to read it. Note the first thing it says is that
 * the record is untouched, because that is what somebody staring at this will want to know.
 */
export function ForcedUpdate({
  version,
  onUpdate,
}: {
  version: string;
  onUpdate: () => void;
}) {
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: SURFACE,
        zIndex: 30,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        gap: 22,
      }}
    >
      <Mark size={56} color={ink.meta} />
      <Text
        style={[
          type({ size: 22, width: 100, lineHeight: 1.3, tracking: -0.01, color: ink.ink }),
          { textAlign: 'center' },
        ]}
      >
        this chinotto is too old to open the record safely.
      </Text>
      <Text
        style={[
          type({ size: 16, width: 94, lineHeight: 1.4, color: ink.far }),
          { textAlign: 'center' },
        ]}
      >
        {`the record is untouched on this phone. the app store has ${version}; it takes a minute.`}
      </Text>
      <Pressable
        onPress={onUpdate}
        accessibilityRole="button"
        style={{
          height: 56,
          paddingHorizontal: 36,
          backgroundColor: agency.ink,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 8,
        }}
      >
        <Text style={{ fontFamily: face(92), fontSize: 16, color: SURFACE }}>update</Text>
      </Pressable>
    </View>
  );
}
