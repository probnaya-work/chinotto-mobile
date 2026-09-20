/**
 * Sync: one sheet, every state.
 *
 * Six of them, and the sheet is the same sheet throughout — off, choosing a plan, signing in,
 * connecting, on (with or without another device, online or offline), sign-in expired, and
 * one moment worded twice. Nothing here is a separate screen, because they are all the same
 * question seen at different moments.
 *
 * The conflict state is the one that matters most and is easiest to get wrong. **Both
 * wordings are kept and neither is chosen for you.** The record goes on showing the local
 * one until somebody says otherwise, and whichever is not shown stays under the moment as
 * earlier wording. The legacy contract carries no wording history, so which came first is
 * genuinely unknown — which is exactly why this asks instead of resolving.
 */

import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ink, rule, SURFACE } from './tokens';
import { face, type } from './type';

export type SyncState =
  | 'off'
  | 'plan'
  | 'apple'
  | 'connecting'
  | 'on'
  | 'error';

export type SyncDevice = {
  id: string;
  name: string;
  /** `now`, `a moment ago`, `last seen 16:38`. Never invented. */
  lastSeen: string;
  isThisDevice: boolean;
};

export type WordingConflict = {
  fragmentId: string;
  localText: string;
  remoteText: string;
  localLabel: string;
  remoteLabel: string;
  shows: 'local' | 'remote';
};

export type SyncSheetProps = {
  state: SyncState;
  offline: boolean;
  pending: number;
  onClose: () => void;

  plans: { id: string; name: string; price: string; note: string }[];
  chosenPlan: string;
  onPickPlan: (id: string) => void;
  planCta: string;
  onContinueWithPlan: () => void;
  onRestore: () => void;
  errorMessage: string | null;

  onContinueWithApple: () => void;
  connectingLine: string;

  devices: SyncDevice[];
  justEnabled: boolean;
  linkCopyLabel: string;
  onCopyLink: () => void;
  confirming: 'device' | 'stop' | null;
  confirmingDeviceName: string | null;
  onAskRemoveDevice: (id: string) => void;
  onRemoveDevice: () => void;
  onAskStop: () => void;
  onStop: () => void;
  onCancelConfirm: () => void;

  conflict: WordingConflict | null;
  onKeepWording: (which: 'local' | 'remote') => void;
  onSettleConflict: () => void;

  onSignInAgain: () => void;
  errorWhen: string;
};

const body = type({ size: 16, width: 94, lineHeight: 1.4, color: ink.near });
const quiet = type({ size: 14, width: 90, lineHeight: 1.4, color: ink.meta });

export function SyncSheet(props: SyncSheetProps) {
  const pendingLine = props.pending === 1 ? '1 moment is' : `${props.pending} moments are`;

  return (
    <Pressable
      onPress={props.onClose}
      accessibilityLabel="close sync"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(14,14,16,0.72)',
        zIndex: 7,
        justifyContent: 'flex-end',
      }}
    >
      <Pressable
        // The sheet itself does not close when tapped; only the field behind it does.
        onPress={() => {}}
        style={{
          backgroundColor: SURFACE,
          borderTopWidth: 1,
          borderTopColor: rule.line,
          paddingHorizontal: 24,
          paddingTop: 20,
          paddingBottom: 40,
          maxHeight: '88%',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <Text style={type({ size: 12, width: 90, color: ink.meta })}>sync</Text>
          <Text onPress={props.onClose} style={type({ size: 14, width: 90, color: ink.far })}>
            close
          </Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {props.conflict ? (
            <Conflict {...props} conflict={props.conflict} />
          ) : props.state === 'plan' || props.state === 'off' ? (
            <Plan {...props} />
          ) : props.state === 'apple' ? (
            <Apple {...props} />
          ) : props.state === 'connecting' ? (
            <Connecting {...props} />
          ) : props.state === 'error' ? (
            <SignInExpired {...props} pendingLine={pendingLine} />
          ) : (
            <On {...props} pendingLine={pendingLine} />
          )}
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

function Plan(props: SyncSheetProps) {
  return (
    <View style={{ gap: 18 }}>
      <Text
        style={type({ size: 22, width: 100, lineHeight: 1.3, tracking: -0.01, color: ink.ink })}
      >
        the record can follow you to your mac.
      </Text>
      <Text style={body}>
        local by default. sync is the one thing chinotto charges for — it pays for the server
        the record travels through.
      </Text>

      <View style={{ gap: 10 }}>
        {props.plans.map((plan) => (
          <Pressable
            key={plan.id}
            onPress={() => props.onPickPlan(plan.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: props.chosenPlan === plan.id }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              minHeight: 52,
              paddingVertical: 8,
              paddingHorizontal: 16,
              borderWidth: 1,
              borderColor: props.chosenPlan === plan.id ? ink.ink : rule.line,
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderWidth: 1,
                borderColor: ink.meta,
                backgroundColor: props.chosenPlan === plan.id ? ink.ink : 'transparent',
              }}
            />
            <Text style={type({ size: 16, width: 94, color: ink.ink })}>{plan.name}</Text>
            <Text style={quiet}>{plan.note}</Text>
            <Text
              style={[type({ size: 16, width: 94, color: ink.ink }), { marginLeft: 'auto' }]}
            >
              {plan.price}
            </Text>
          </Pressable>
        ))}
      </View>

      <Filled label={props.planCta} onPress={props.onContinueWithPlan} />

      <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap' }}>
        <Text onPress={props.onRestore} style={quiet}>
          restore a purchase
        </Text>
        <Text style={quiet}>terms</Text>
        <Text style={quiet}>privacy</Text>
        <Text onPress={props.onClose} style={[quiet, { marginLeft: 'auto' }]}>
          not now
        </Text>
      </View>

      {props.errorMessage ? (
        <Text style={type({ size: 14, width: 90, lineHeight: 1.4, color: ink.far })}>
          {props.errorMessage}
        </Text>
      ) : null}
    </View>
  );
}

function Apple(props: SyncSheetProps) {
  return (
    <View style={{ gap: 18 }}>
      <Text
        style={type({ size: 22, width: 100, lineHeight: 1.3, tracking: -0.01, color: ink.ink })}
      >
        one sign-in, so the mac knows it’s you.
      </Text>
      <Text style={body}>
        apple id only. chinotto never sees a password, and the record is tied to nothing else.
      </Text>
      <Filled label="continue with apple" onPress={props.onContinueWithApple} />
      <Text onPress={props.onClose} style={quiet}>
        not now
      </Text>
    </View>
  );
}

function Connecting(props: SyncSheetProps) {
  return (
    <View style={{ gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ width: 6, height: 6, backgroundColor: ink.meta }} />
          ))}
        </View>
        <Text style={body}>{props.connectingLine}</Text>
      </View>
      {/* Capture never waits on the network, and the sheet says so rather than spinning. */}
      <Text style={quiet}>
        the record leaves the phone in the background. you can keep writing.
      </Text>
    </View>
  );
}

function On(props: SyncSheetProps & { pendingLine: string }) {
  const others = props.devices.filter((d) => !d.isThisDevice);
  const head = props.offline
    ? 'sync is on. the phone is offline.'
    : props.justEnabled
      ? 'sync is on. now the mac.'
      : 'sync is on.';

  return (
    <View style={{ gap: 18 }}>
      <Text
        style={type({ size: 22, width: 100, lineHeight: 1.3, tracking: -0.01, color: ink.ink })}
      >
        {head}
      </Text>
      <Text style={body}>
        {props.offline
          ? 'everything you leave still lands here first.'
          : 'new moments go across in the background. nothing here waits on it.'}
      </Text>

      {props.offline ? (
        <Text style={quiet}>
          {`offline · ${props.pendingLine} waiting on the phone. they go the moment you’re back; nothing needs you.`}
        </Text>
      ) : null}

      {props.justEnabled ? (
        <Text style={type({ size: 14, width: 90, lineHeight: 1.4, color: ink.far })}>
          {'on your mac, open chinotto › settings › sync and point it here, or go to '}
          <Text style={{ color: ink.ink }}>getchinotto.app/sync</Text>
          {' · '}
          <Text onPress={props.onCopyLink} style={{ color: ink.ink }}>
            {props.linkCopyLabel}
          </Text>
        </Text>
      ) : null}

      <View style={{ gap: 10, paddingTop: 8 }}>
        <Text
          style={{
            fontFamily: face(90),
            fontSize: 10,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: ink.meta,
          }}
        >
          devices on this record
        </Text>
        {props.devices.map((device) => (
          <View key={device.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 6, height: 6, backgroundColor: ink.meta }} />
            <Text style={type({ size: 16, width: 94, color: ink.near })}>{device.name}</Text>
            <Text style={quiet}>{device.lastSeen}</Text>
            {!device.isThisDevice ? (
              <Text
                onPress={() => props.onAskRemoveDevice(device.id)}
                style={[quiet, { marginLeft: 'auto', color: ink.verb }]}
              >
                remove
              </Text>
            ) : null}
          </View>
        ))}
        {/* No row is ever invented. An empty list says so. */}
        {others.length === 0 && !props.justEnabled ? (
          <Text style={quiet}>no other device yet.</Text>
        ) : null}
        {props.confirming === 'device' ? (
          <Text style={type({ size: 14, width: 90, lineHeight: 1.4, color: ink.far })}>
            {`remove ${props.confirmingDeviceName ?? 'it'} from this record? what’s already on it stays; it just stops receiving. `}
            <Text onPress={props.onRemoveDevice} style={{ color: ink.ink }}>
              remove
            </Text>
            {' · '}
            <Text onPress={props.onCancelConfirm} style={{ color: ink.verb }}>
              keep
            </Text>
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 18, paddingTop: 8 }}>
        <Text onPress={props.onAskStop} style={quiet}>
          stop syncing on this phone
        </Text>
        <Text onPress={props.onClose} style={[quiet, { marginLeft: 'auto', color: ink.ink }]}>
          done
        </Text>
      </View>

      {props.confirming === 'stop' ? (
        <Text style={type({ size: 14, width: 90, lineHeight: 1.4, color: ink.far })}>
          {'stop syncing on this phone? the record stays here in full — it just stops travelling. '}
          <Text onPress={props.onStop} style={{ color: ink.ink }}>
            stop
          </Text>
          {' · '}
          <Text onPress={props.onCancelConfirm} style={{ color: ink.verb }}>
            keep syncing
          </Text>
        </Text>
      ) : null}
    </View>
  );
}

function SignInExpired(props: SyncSheetProps & { pendingLine: string }) {
  return (
    <View style={{ gap: 18 }}>
      <Text
        style={type({ size: 22, width: 100, lineHeight: 1.3, tracking: -0.01, color: ink.ink })}
      >
        sync stopped.
      </Text>
      {/* Says what was NOT lost first, because that is the question being asked. */}
      <Text style={body}>
        {`this phone’s sign-in expired ${props.errorWhen}. nothing was lost — ${props.pendingLine} waiting here, and the mac kept going.`}
      </Text>
      <Filled label="sign in again" onPress={props.onSignInAgain} />
      <Text onPress={props.onAskStop} style={quiet}>
        or stop syncing on this phone
      </Text>
    </View>
  );
}

function Conflict(props: SyncSheetProps & { conflict: WordingConflict }) {
  const sides = [
    {
      id: 'local' as const,
      head: props.conflict.localLabel,
      text: props.conflict.localText,
    },
    {
      id: 'remote' as const,
      head: props.conflict.remoteLabel,
      text: props.conflict.remoteText,
    },
  ];

  return (
    <View style={{ gap: 18 }}>
      <Text
        style={type({ size: 22, width: 100, lineHeight: 1.3, tracking: -0.01, color: ink.ink })}
      >
        one moment was worded twice
      </Text>
      <Text style={body}>
        you corrected the same moment on both devices while they were apart. both wordings are
        here; neither was thrown away.
      </Text>

      {sides.map((side) => (
        <View
          key={side.id}
          style={{
            gap: 5,
            paddingLeft: 14,
            borderLeftWidth: 2,
            borderLeftColor: props.conflict.shows === side.id ? ink.ink : rule.line,
          }}
        >
          <Text style={type({ size: 12, width: 90, color: ink.meta })}>{side.head}</Text>
          <Text style={type({ size: 16, width: 94, lineHeight: 1.35, color: ink.near })}>
            {side.text}
          </Text>
          {props.conflict.shows === side.id ? (
            <Text style={quiet}>shown in the record now</Text>
          ) : (
            <Text
              onPress={() => props.onKeepWording(side.id)}
              style={[quiet, { color: ink.verb }]}
            >
              show this one instead
            </Text>
          )}
        </View>
      ))}

      <Text style={type({ size: 14, width: 90, lineHeight: 1.4, color: ink.far })}>
        <Text onPress={props.onSettleConflict} style={{ color: ink.ink }}>
          that’s settled
        </Text>
        {' · the other stays under the moment as earlier wording.'}
      </Text>
    </View>
  );
}

function Filled({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        height: 56,
        backgroundColor: ink.ink,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: face(92), fontSize: 16, color: SURFACE }}>{label}</Text>
    </Pressable>
  );
}

/**
 * How long ago a device was last heard from.
 *
 * Only ever says what is known. A device that has never checked in has no last-seen, and the
 * row is not drawn rather than claiming "a moment ago".
 */
export function lastSeenLabel(lastSeenAt: number | null, now: number): string | null {
  if (lastSeenAt === null) return null;
  const delta = now - lastSeenAt;
  if (delta < 90_000) return 'now';
  if (delta < 3 * 60_000) return 'a moment ago';
  if (delta < 3600_000) return `${Math.round(delta / 60_000)} minutes ago`;
  const d = new Date(lastSeenAt);
  return `last seen ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
