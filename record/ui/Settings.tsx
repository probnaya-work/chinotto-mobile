/**
 * Settings — "this iphone".
 *
 * Reached by pulling down from under the status bar, and by nothing else. Seven sections of
 * prose rather than a list of switches: each one says what is true, and where there is
 * something to change it offers a verb at the end of the sentence.
 *
 * Two sub-pages push in over it and come back with `‹ edge`: the manifesto, and deleting
 * the cloud account.
 *
 * Note what is *not* here. There is no export, because the prototype draws none — recorded
 * as pending (§8.1) rather than accepted, since it means the record cannot currently leave
 * the phone. There is no text-size control, which desktop has and the mobile prototype does
 * not.
 */

import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Mark } from './Mark';
import { ink, rule, SURFACE } from './tokens';
import { face, type } from './type';

export type IconChoice = 'dark' | 'light';
export type SettingsPage = 'root' | 'manifesto' | 'delete';

export type SettingsProps = {
  page: SettingsPage;
  onClose: () => void;
  onBack: () => void;

  /** `on · this iphone and aleks's macbook.` — what is true, in a sentence. */
  syncLine: string;
  syncVerb: string;
  onOpenSync: () => void;


  icon: IconChoice;
  onPickIcon: (choice: IconChoice) => void;

  micLine: string;
  micDenied: boolean;
  onOpenSystemSettings: () => void;
  onSeeWidget: () => void;

  analyticsOn: boolean;
  onToggleAnalytics: () => void;
  privacyOpen: boolean;
  onTogglePrivacy: () => void;

  hasAccount: boolean;
  onOpenDelete: () => void;
  onOpenManifesto: () => void;

  version: string;
  updateLine: string;

  deleteArmed: boolean;
  onDeleteStep: () => void;
  /** True while the deletion is actually running, so nothing is pressed twice. */
  deleteBusy: boolean;
  /** What went wrong, in a sentence. Null when nothing has. */
  deleteError: string | null;
};

const body = type({ size: 16, width: 94, lineHeight: 1.4, color: ink.near });
const sectionLabel = {
  fontFamily: face(90),
  fontSize: 10,
  letterSpacing: 0.6,
  textTransform: 'uppercase' as const,
  color: ink.meta,
};

export function Settings(props: SettingsProps) {
  const head =
    props.page === 'manifesto'
      ? 'why chinotto'
      : props.page === 'delete'
        ? 'account'
        : 'this iphone';

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: SURFACE,
        zIndex: 4,
      }}
    >
      <View style={{ height: 54 }} />
      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Pressable
          onPress={props.page === 'root' ? props.onClose : props.onBack}
          accessibilityRole="button"
          hitSlop={12}
        >
          <Text style={type({ size: 14, width: 90, color: ink.far })}>‹ edge</Text>
        </Pressable>
        <View
          style={{
            marginLeft: 'auto',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {props.page === 'root' ? <Mark size={22} color={ink.meta} /> : null}
          <Text style={type({ size: 12, width: 90, color: ink.meta })}>{head}</Text>
        </View>
      </View>

      {props.page === 'root' ? <Root {...props} /> : null}
      {props.page === 'manifesto' ? <Manifesto /> : null}
      {props.page === 'delete' ? <DeleteAccount {...props} /> : null}
    </View>
  );
}

function Root(props: SettingsProps) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 30, paddingBottom: 60, gap: 32 }}
      showsVerticalScrollIndicator={false}
    >
      <Section label="sync">
        <Text style={body}>
          {`${props.syncLine} `}
          <Text onPress={props.onOpenSync} style={{ color: ink.ink }}>
            {`${props.syncVerb} ›`}
          </Text>
        </Text>
      </Section>

      {/*
        One appearance, because there is one.

        This used to offer `system · light · dark` and a contrast lift. None of the three
        did anything: there is a single palette in `tokens.ts`, the prototype draws no light
        screen, and the choice did not even survive a relaunch. A control that selects an
        appearance the app cannot render is worse than no control — `system` in particular
        promised to follow a phone it could not follow.

        So it says what is true and offers nothing. When light is designed, this becomes a
        choice again; see 8.9 / 8.10.
      */}
      <Section label="appearance" gap={10}>
        <Text style={body}>dark.</Text>
        <Text style={type({ size: 14, width: 90, lineHeight: 1.4, color: ink.meta })}>
          the record has one appearance, and this is it. a light one is not designed yet, so
          it is not offered.
        </Text>
      </Section>

      <Section label="home screen icon" gap={10}>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          {(
            [
              ['dark', '#141416', '#e6e6e3', '#2a2a2e'],
              ['light', '#f2f1ec', '#1b1b1d', '#c9c9c6'],
            ] as const
          ).map(([id, background, foreground, border]) => (
            <Pressable
              key={id}
              onPress={() => props.onPickIcon(id)}
              accessibilityRole="button"
              accessibilityLabel={`${id} icon`}
              accessibilityState={{ selected: props.icon === id }}
              style={{ alignItems: 'center', gap: 6 }}
            >
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 14,
                  backgroundColor: background,
                  borderWidth: 1,
                  borderColor: props.icon === id ? ink.ink : border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Mark size={37} rung="full" color={foreground} />
              </View>
              <Text
                style={type({
                  size: 11,
                  width: 90,
                  color: props.icon === id ? ink.ink : ink.meta,
                })}
              >
                {id}
              </Text>
            </Pressable>
          ))}
          <Text
            style={[
              type({ size: 12, width: 90, lineHeight: 1.4, color: ink.meta }),
              { flex: 1 },
            ]}
          >
            ios tints and android themes these two on their own.
          </Text>
        </View>
      </Section>

      <Section label="from elsewhere" gap={10}>
        <Text style={body}>
          share sheet · send a page, a selection or a photo to chinotto from any app. it lands
          dated now.
        </Text>
        <Text style={body}>
          {'home widget · capture, and the last thing you left. '}
          <Text onPress={props.onSeeWidget} style={{ color: ink.ink }}>
            see it
          </Text>
        </Text>
        <Text style={type({ size: 14, width: 90, lineHeight: 1.4, color: ink.far })}>
          {`microphone · ${props.micLine} `}
          {props.micDenied ? (
            <Text onPress={props.onOpenSystemSettings} style={{ color: ink.ink }}>
              open settings ›
            </Text>
          ) : null}
        </Text>
      </Section>

      <Section label="privacy" gap={10}>
        <Text style={body}>
          the words stay on this phone unless sync is on, and then only go to your own devices.
        </Text>
        <Text style={type({ size: 14, width: 90, lineHeight: 1.4, color: ink.far })}>
          {'anonymous usage · '}
          <Text style={{ color: ink.near }}>{props.analyticsOn ? 'on' : 'off'}</Text>
          {' · '}
          <Text onPress={props.onToggleAnalytics} style={{ color: ink.ink }}>
            {props.analyticsOn ? 'turn off' : 'turn on'}
          </Text>
          {' · '}
          <Text onPress={props.onTogglePrivacy} style={{ color: ink.verb }}>
            {props.privacyOpen ? 'hide' : 'what is sent?'}
          </Text>
        </Text>
        {/* Expands in place. The prototype forbids the timed modal this replaces. */}
        {props.privacyOpen ? (
          <Text style={type({ size: 14, width: 90, lineHeight: 1.45, color: ink.meta })}>
            only event names and counts — “fragment left”, “find used · 12 results”. never the
            words, never what you searched for, never anything that identifies you. off unless
            you turn it on.
          </Text>
        ) : null}
      </Section>

      {props.hasAccount ? (
        <Section label="account" gap={10}>
          <Text style={body}>apple id · the only thing sync knows about you.</Text>
          <Text onPress={props.onOpenDelete} style={[body, { color: ink.ink }]}>
            delete the cloud account ›
          </Text>
        </Section>
      ) : null}

      <Section label="about" gap={10}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Mark size={26} color={ink.ink} />
          <Text style={type({ size: 18, width: 96, weight: 500, color: ink.ink })}>chinotto</Text>
        </View>
        <Text onPress={props.onOpenManifesto} style={[body, { color: ink.ink }]}>
          why chinotto ›
        </Text>
        <Text style={type({ size: 12, width: 90, color: ink.meta })}>
          {`${props.version} · ${props.updateLine}`}
        </Text>
        {/* Secondary maker's mark. PROBNAYA is the laboratory; Chinotto keeps its own identity. */}
        <Text style={type({ size: 12, width: 90, color: ink.meta })}>
          PROBNAYA · Independent Computational Laboratory
        </Text>
      </Section>
    </ScrollView>
  );
}

function Section({
  label,
  gap = 8,
  children,
}: {
  label: string;
  gap?: number;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap }}>
      <Text style={sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

/** The argument, in the product's own words. Not marketing, and not a tour. */
function Manifesto() {
  const paragraphs = [
    'Thinking rarely starts structured.',
    'Most tools assume the opposite. They ask you to create a document, a folder, a workspace before you even know what the thought is.',
    'So you name things, you organize, you plan — and the thought slips away. Sometimes you do not write it down at all because the friction is too high.',
    'Chinotto is built for the moment the thought appears. You open it, capture it, and move on. No hierarchy to maintain. Just capture.',
    'Structure can come later, when the thought has had time to settle. Not before.',
  ];
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 30, paddingBottom: 60, gap: 18 }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={type({ size: 22, width: 100, lineHeight: 1.3, tracking: -0.01, color: ink.ink })}
      >
        capture first. continue later.
      </Text>
      {paragraphs.map((p) => (
        <Text key={p} style={body}>
          {p}
        </Text>
      ))}
    </ScrollView>
  );
}

/**
 * Deleting the cloud account.
 *
 * Two steps, in place — never a system alert. The copy is precise about what goes and what
 * stays, because the thing most likely to be misread here is that the record itself is at
 * risk. It is not: only the copy in the cloud goes.
 */
function DeleteAccount(props: SettingsProps) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 30, paddingBottom: 60, gap: 18 }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={type({ size: 22, width: 100, lineHeight: 1.3, tracking: -0.01, color: ink.ink })}
      >
        delete the cloud account?
      </Text>
      <Text style={body}>
        the copy of the record in the cloud goes, for good. the record on this phone and on
        your mac stays exactly as it is — they just stop meeting.
      </Text>
      <Text style={type({ size: 14, width: 90, lineHeight: 1.4, color: ink.meta })}>
        a subscription is apple’s, not ours: cancel it in the app store first if you don’t want
        it to renew.
      </Text>
      {props.deleteArmed ? (
        <Text style={type({ size: 14, width: 90, lineHeight: 1.4, color: ink.far })}>
          this can’t be undone. apple will ask you to sign in once more.
        </Text>
      ) : null}
      {props.deleteError ? (
        <Text style={type({ size: 14, width: 90, lineHeight: 1.4, color: ink.ink })}>
          {props.deleteError}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
        <Pressable
          onPress={props.deleteBusy ? undefined : props.onDeleteStep}
          disabled={props.deleteBusy}
          accessibilityRole="button"
          style={{
            flex: 1,
            opacity: props.deleteBusy ? 0.5 : 1,
            height: 56,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: props.deleteArmed ? ink.ink : 'transparent',
            borderWidth: 1,
            borderColor: props.deleteArmed ? ink.ink : ink.faint,
          }}
        >
          <Text
            style={{
              fontFamily: face(92),
              fontSize: 16,
              color: props.deleteArmed ? SURFACE : ink.near,
            }}
          >
            {props.deleteBusy
              ? 'deleting…'
              : props.deleteArmed
                ? 'delete for good'
                : 'delete the account'}
          </Text>
        </Pressable>
        <Pressable
          onPress={props.onBack}
          accessibilityRole="button"
          style={{
            height: 56,
            paddingHorizontal: 22,
            borderWidth: 1,
            borderColor: rule.line,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: face(92), fontSize: 16, color: ink.verb }}>keep it</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

/** The sentences settings uses to say what is true. Kept together so they read as a set. */
export const settingsCopy = {
  sync(state: {
    on: boolean;
    offline: boolean;
    pending: number;
    error: boolean;
    otherDevice: string | null;
  }): string {
    if (state.error) return 'stopped · this phone’s sign-in expired.';
    if (!state.on) return 'off · the record is only on this phone.';
    if (state.offline) return `on · offline, ${state.pending} waiting.`;
    return state.otherDevice ? `on · this iphone and ${state.otherDevice}.` : 'on · only this iphone so far.';
  },
  syncVerb(state: { on: boolean; error: boolean }): string {
    if (state.error) return 'fix';
    return state.on ? 'manage' : 'set up';
  },
  microphone(permission: 'granted' | 'ask' | 'denied'): string {
    if (permission === 'denied') return 'off for chinotto.';
    if (permission === 'ask') return 'not asked yet · ios asks the first time you hold the circle.';
    return 'allowed.';
  },
};
