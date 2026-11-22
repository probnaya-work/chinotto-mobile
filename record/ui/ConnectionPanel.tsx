import React, { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';

import { findConnection, type ConnectionResult } from '../findConnection';
import { connectionBetween, meaningConnectionBetween } from '../model/connections';
import type { Material } from '../model/material';
import { fullDate } from '../model/time';
import type { TextPart } from '../model/words';
import { useRecordTheme } from './appearance';
import { Marked } from './Marked';
import { type } from './type';

type PanelState = 'closed' | 'looking' | 'error' | Extract<ConnectionResult, string> |
  (Extract<ConnectionResult, object> & { dismissing?: boolean; failed?: boolean });

export type ConnectionData = {
  material: Material[];
  rejections: (sourceId: string) => Promise<string[]>;
  dismiss: (sourceId: string, relatedId: string) => Promise<void>;
  onReadRelated: (id: string) => void;
};

export type ConnectionPanelHandle = { look: () => void };

export function ConnectionPanel({ source, data, fontScale, onReadSource, onLayout, showLookAction = true, ref }: {
  source: Material;
  data: ConnectionData;
  fontScale: number;
  onReadSource: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  showLookAction?: boolean;
  ref?: React.Ref<ConnectionPanelHandle>;
}) {
  const { ink, rule } = useRecordTheme();
  const [state, setState] = useState<PanelState>('closed');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const result = typeof state === 'object' ? state : null;
  const id = result?.id;
  const meaning = result?.meaning;
  const connection = useMemo(() => {
    if (!id) return null;
    const other = data.material.find((thought) => thought.id === id);
    if (!other) return null;
    return meaning ? meaningConnectionBetween(source, other, meaning) : connectionBetween(source, other);
  }, [source, data.material, id, meaning]);

  async function look() {
    if (state === 'looking' || (typeof state === 'object' && state.dismissing)) return;
    setState('looking');
    try {
      const rejected = await data.rejections(source.id);
      if (!mounted.current) return;
      const match = await findConnection(source, data.material, new Set(rejected));
      if (mounted.current) setState(match);
    } catch {
      if (mounted.current) setState('error');
    }
  }

  async function dismiss(relatedId: string) {
    setState({ id: relatedId, meaning, dismissing: true });
    try {
      await data.dismiss(source.id, relatedId);
      if (mounted.current) setState('closed');
    } catch {
      if (mounted.current) setState({ id: relatedId, meaning, failed: true });
    }
  }

  useImperativeHandle(ref, () => ({ look }));

  if (state === 'closed' && !showLookAction) return null;

  return (
    <View key={fontScale} onLayout={onLayout} style={{ gap: 8, marginTop: showLookAction ? 0 : 20 }}>
      {state === 'closed' ? (
        <ConnectionAction label="look for a connection" onPress={() => void look()} />
      ) : state === 'looking' ? (
        <Text accessibilityLiveRegion="polite" style={type({ size: 14, width: 94, color: ink.far })}>
          looking for a connection…
        </Text>
      ) : (
        <>
          <Text accessibilityRole="header" style={type({ size: 16, width: 94, color: ink.ink })}>
            possible connection
          </Text>
          {connection && typeof state === 'object' ? (
            <>
              <Text style={type({ size: 13, width: 92, color: ink.far })}>
                {meaning ? 'a possible similarity in meaning · compared on this device' : 'shared words in two moments'}
              </Text>
              <Passage label="this thought" at={source.at} excerpt={connection.sourceExcerpt}
                onPress={onReadSource} disabled={state.dismissing} />
              <Passage label="another thought" at={connection.related.at} excerpt={connection.relatedExcerpt}
                onPress={() => data.onReadRelated(connection.related.id)} disabled={state.dismissing} />
              {state.failed ? (
                <Text accessibilityRole="alert" style={type({ size: 13, width: 92, color: ink.far })}>
                  could not dismiss this connection
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, borderTopWidth: 1, borderTopColor: rule.hair }}>
                <ConnectionAction label="not this" onPress={() => void dismiss(connection.related.id)} disabled={state.dismissing} />
                <ConnectionAction label="close connection" onPress={() => setState('closed')} disabled={state.dismissing} />
              </View>
            </>
          ) : (
            <>
              <Text accessibilityLiveRegion="polite" style={type({ size: 14, width: 94, color: ink.far })}>
                {state === 'preparing' ? 'meaning search is preparing on this device' :
                  state === 'error' ? 'could not look for a connection' :
                  state === 'empty' ? 'no clear connection found' : 'this connection is no longer available'}
              </Text>
              {state === 'preparing' ?
                <ConnectionAction label="try again" onPress={() => void look()} /> : null}
              <ConnectionAction label="close connection" onPress={() => setState('closed')} />
            </>
          )}
        </>
      )}
    </View>
  );
}

function ConnectionAction({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { agency } = useRecordTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled}
      style={({ pressed }) => ({
        alignSelf: 'flex-start', minWidth: 48, minHeight: 48, justifyContent: 'center',
        opacity: pressed || disabled ? 0.65 : 1,
      })}>
      <Text style={type({ size: 14, width: 94, color: agency.ink, weight: agency.weight })}>{label}</Text>
    </Pressable>
  );
}

function Passage({ label, at, excerpt, onPress, disabled }: {
  label: string; at: number; excerpt: TextPart[]; onPress: () => void; disabled?: boolean;
}) {
  const { ink, evidence } = useRecordTheme();
  const title = `${label} · ${fullDate(at)}`;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${excerpt.map((part) => part.t).join('')}`}
      accessibilityHint="opens the original thought" onPress={onPress} disabled={disabled}
      style={({ pressed }) => ({
        borderLeftWidth: 1, borderLeftColor: evidence.railInferred, paddingLeft: 12,
        minHeight: 48, paddingVertical: 6, gap: 4, opacity: pressed || disabled ? 0.65 : 1,
      })}>
      <Text style={type({ size: 13, width: 92, color: ink.meta })}>{title} ›</Text>
      <Marked parts={excerpt} quiet style={type({ size: 15, width: 94, lineHeight: 1.4, color: ink.ink })} />
    </Pressable>
  );
}
