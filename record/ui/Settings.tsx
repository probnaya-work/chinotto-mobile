/**
 * Settings — "this iphone".
 *
 * Reached by pulling down from under the status bar, and by nothing else. The root is a
 * quiet index rather than a system settings list: full-width actions make it usable, while
 * the privacy and Chinotto sections keep the record's more editorial rhythm.
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
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { Mark } from './Mark';
import { capabilitiesFor, type PlatformCapabilities } from '../platform';
import { agency, ink, rule, SURFACE } from './tokens';
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
  /** Null where no update check runs; then only the version is shown. */
  updateLine: string | null;

  deleteArmed: boolean;
  onDeleteStep: () => void;
  /** True while the deletion is actually running, so nothing is pressed twice. */
  deleteBusy: boolean;
  /** What went wrong, in a sentence. Null when nothing has. */
  deleteError: string | null;

  /** What this phone can do. Defaults to the platform's own answer. */
  capabilities?: PlatformCapabilities;
};

const body = type({ size: 16, width: 94, lineHeight: 1.4, color: ink.near });
const sectionLabel = {
  fontFamily: face(90),
  fontSize: 10,
  letterSpacing: 0.6,
  textTransform: 'uppercase' as const,
  color: ink.far,
};

export function Settings(props: SettingsProps) {
  const can = props.capabilities ?? capabilitiesFor(Platform.OS);
  const head =
    props.page === 'manifesto'
      ? 'why chinotto'
      : props.page === 'delete'
        ? 'account'
        : `this ${can.deviceNoun}`;

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
          {props.page === 'root' ? <Mark size={24} color={agency.quiet} /> : null}
          {props.page === 'root' ? null : (
            <Text style={type({ size: 12, width: 90, color: ink.meta })}>{head}</Text>
          )}
        </View>
      </View>

      {props.page === 'root' ? <Root {...props} capabilities={can} /> : null}
      {props.page === 'manifesto' ? <Manifesto paragraphs={can.manifesto} /> : null}
      {props.page === 'delete' ? <DeleteAccount {...props} /> : null}
    </View>
  );
}

function Root(props: SettingsProps & { capabilities: PlatformCapabilities }) {
  const can = props.capabilities;
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 18, paddingBottom: 46, gap: 21 }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={type({ size: 26, width: 100, lineHeight: 1.12, tracking: -0.02, color: agency.quiet })}
      >
        {`this ${can.deviceNoun}`}
      </Text>

      {/*
        Only where sync can be set up. Elsewhere — Android, until its sign-in and entitlement
        are decided (unspecified-decisions §10) — there is no sync section at all, rather than
        one explaining its own absence.
      */}
      <Section label="record" gap={0}>
        {can.syncSetup ? (
          <SettingRow
            title="sync"
            detail={props.syncLine}
            action={`${props.syncVerb} ›`}
            onPress={props.onOpenSync}
          />
        ) : null}
        {can.voice ? (
          <SettingRow
            title="microphone"
            detail={props.micLine}
            action={props.micDenied ? 'settings ›' : undefined}
            status={props.micDenied ? undefined : microphoneStatus(props.micLine)}
            onPress={props.micDenied ? props.onOpenSystemSettings : undefined}
          />
        ) : null}
        <SettingRow
          title="from elsewhere"
          detail={`share sheet · send ${can.shareKinds} to chinotto from any app. it lands dated now.`}
          action={can.homeWidget ? 'see it' : undefined}
          onPress={can.homeWidget ? props.onSeeWidget : undefined}
          divider={false}
        />
      </Section>

      {/* One appearance, because there is one. The absence of a light-mode switch is honest. */}
      <Section label="appearance" gap={7}>
        <SettingRow title="app" status="dark" divider={false} />
        {can.iconChoice ? (
          <View style={{ gap: 7, paddingTop: 1 }}>
            <Text style={type({ size: 12, width: 90, color: ink.meta })}>
              home screen icon
            </Text>
            <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
              {(
                [
                  ['dark', '#141416', '#d4d3ce', '#2a2a2e'],
                  ['light', '#f2f1ec', '#1b1b1d', '#c9c9c6'],
                ] as const
              ).map(([id, background, foreground, border]) => (
                <Pressable
                  key={id}
                  onPress={() => props.onPickIcon(id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${id} icon`}
                  accessibilityState={{ selected: props.icon === id }}
                  hitSlop={4}
                  style={({ pressed }) => ({
                    minWidth: 60,
                    minHeight: 76,
                    alignItems: 'center',
                    gap: 5,
                    opacity: pressed ? 0.62 : 1,
                  })}
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
                  { flex: 1, paddingTop: 4 },
                ]}
              >
                ios tints and android themes these two on their own.
              </Text>
            </View>
          </View>
        ) : null}
      </Section>

      <Section label="privacy" gap={7}>
        <View style={{ borderLeftWidth: 1, borderLeftColor: rule.line, paddingLeft: 13, gap: 8 }}>
          <Text style={type({ size: 15, width: 94, lineHeight: 1.45, color: ink.near })}>
            {can.privacyLine}
          </Text>
          {can.voicePrivacyLine ? (
            <Text style={type({ size: 13, width: 90, lineHeight: 1.45, color: ink.far })}>
              {can.voicePrivacyLine}
            </Text>
          ) : null}
        </View>
        <SettingRow
          title="anonymous usage"
          detail="never your words or searches"
          action={`${props.analyticsOn ? 'on' : 'off'} ›`}
          onPress={props.onToggleAnalytics}
          accessibilityRole="switch"
          checked={props.analyticsOn}
        />
        <Pressable
          onPress={props.onTogglePrivacy}
          accessibilityRole="button"
          hitSlop={4}
          style={({ pressed }) => ({
            minHeight: 44,
            alignSelf: 'flex-start',
            justifyContent: 'center',
            opacity: pressed ? 0.62 : 1,
          })}
        >
          <Text style={type({ size: 13, width: 90, weight: agency.weight, color: agency.ink })}>
            {props.privacyOpen ? 'hide the detail ↑' : 'what is sent? ↓'}
          </Text>
        </Pressable>
        {/* Expands in place. The prototype forbids the timed modal this replaces. */}
        {props.privacyOpen ? (
          <View style={{ borderLeftWidth: 1, borderLeftColor: rule.line, paddingLeft: 13 }}>
            <Text style={type({ size: 13, width: 90, lineHeight: 1.5, color: ink.meta })}>
              only event names and counts — “fragment left”, “find used · 12 results”. never the
              words, never what you searched for, never anything that identifies you. off unless
              you turn it on.
            </Text>
          </View>
        ) : null}
        {props.hasAccount ? (
          <SettingRow
            title="delete cloud account"
            detail="the record stays on your devices"
            action="continue ›"
            onPress={props.onOpenDelete}
            quietAction
            divider={false}
          />
        ) : null}
      </Section>

      <Section label="chinotto" gap={7}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Mark size={28} color={agency.quiet} />
          <Text style={type({ size: 19, width: 96, weight: 500, color: agency.quiet })}>chinotto</Text>
        </View>
        <SettingRow
          title="why chinotto"
          action="read ›"
          onPress={props.onOpenManifesto}
          divider={false}
        />
        <Text style={type({ size: 11, width: 90, color: ink.meta })}>
          {props.updateLine === null ? props.version : `${props.version} · ${props.updateLine}`}
        </Text>
        {/* A colophon, not part of the Chinotto lockup: the instrument keeps its own name. */}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: rule.hair,
            paddingTop: 11,
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <View style={{ gap: 2 }}>
            <Text
              style={type({ size: 9, width: 76, tracking: 0.12, color: ink.meta })}
            >
              AN INSTRUMENT BY
            </Text>
            <Text
              style={type({
                size: 15,
                width: 76,
                tracking: 0.13,
                color: agency.quiet,
              })}
            >
              PROBNAYA
            </Text>
          </View>
          <Text
            style={[
              type({ size: 9, width: 76, lineHeight: 1.3, tracking: 0.08, color: ink.meta }),
              { flex: 1, textAlign: 'right' },
            ]}
          >
            INDEPENDENT COMPUTATIONAL{`\n`}LABORATORY
          </Text>
        </View>
      </Section>
    </ScrollView>
  );
}

function microphoneStatus(line: string): string | undefined {
  if (line === 'allowed.') return 'allowed';
  return undefined;
}

function SettingRow({
  title,
  detail,
  action,
  status,
  onPress,
  divider = true,
  quietAction = false,
  accessibilityRole = 'button',
  checked,
}: {
  title: string;
  detail?: string;
  action?: string;
  status?: string;
  onPress?: () => void;
  divider?: boolean;
  quietAction?: boolean;
  accessibilityRole?: 'button' | 'switch';
  checked?: boolean;
}) {
  const content = (
    <>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={type({ size: 16, width: 96, color: ink.ink })}>{title}</Text>
        {detail ? (
          <Text style={type({ size: 12, width: 90, lineHeight: 1.4, color: ink.meta })}>
            {detail}
          </Text>
        ) : null}
      </View>
      {action ? (
        <Text
          style={type({
            size: 13,
            width: 90,
            weight: agency.weight,
            color: quietAction ? agency.quiet : agency.ink,
          })}
        >
          {action}
        </Text>
      ) : null}
      {status ? (
        <Text style={type({ size: 13, width: 90, color: ink.far })}>{status}</Text>
      ) : null}
    </>
  );
  const style = {
    minHeight: 50,
    paddingVertical: 7,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 14,
    borderBottomWidth: divider ? 1 : 0,
    borderBottomColor: rule.hair,
  };

  if (!onPress) return <View style={style}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={`${title}${action ? `, ${action}` : ''}`}
      accessibilityState={checked === undefined ? undefined : { checked }}
      style={({ pressed }) => [style, { opacity: pressed ? 0.62 : 1 }]}
    >
      {content}
    </Pressable>
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
function Manifesto({ paragraphs }: { paragraphs: readonly string[] }) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 52, gap: 14 }}
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
        <Text style={type({ size: 14, width: 90, lineHeight: 1.4, color: ink.far })}>
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
            backgroundColor: 'transparent',
            borderWidth: 1,
            borderColor: props.deleteArmed ? agency.quiet : ink.faint,
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
          <Text style={{ fontFamily: face(92, { weight: agency.weight }), fontSize: 16, color: agency.ink }}>
            keep it
          </Text>
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
  microphone(permission: 'granted' | 'ask' | 'denied', system: 'ios' | 'android' = 'ios'): string {
    if (permission === 'denied') return 'off for chinotto.';
    if (permission === 'ask') return `not asked yet · ${system} asks the first time you tap the circle.`;
    return 'allowed.';
  },
};
