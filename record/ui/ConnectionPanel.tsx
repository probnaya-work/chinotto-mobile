import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { connectionBetween, possibleConnection } from '../model/connections';
import type { Material } from '../model/material';
import { fullDate } from '../model/time';
import type { TextPart } from '../model/words';
import { useRecordTheme } from './appearance';
import { Marked } from './Marked';
import { type } from './type';

type PanelState = 'closed' | 'looking' | 'empty' | 'error' |
  { id: string; dismissing?: boolean; failed?: boolean };

export type ConnectionData = {
  material: Material[];
  rejections: (sourceId: string) => Promise<string[]>;
  dismiss: (sourceId: string, relatedId: string) => Promise<void>;
  onReadRelated: (id: string) => void;
};

export function ConnectionPanel({ source, data, fontScale, onReadSource }: {
  source: Material;
  data: ConnectionData;
  fontScale: number;
  onReadSource: () => void;
}) {
  const { ink, rule } = useRecordTheme();
  const [state, setState] = useState<PanelState>('closed');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const id = typeof state === 'object' ? state.id : null;
  const connection = useMemo(() => {
    if (!id) return null;
    const other = data.material.find((thought) => thought.id === id);
    return other ? connectionBetween(source, other) : null;
  }, [source, data.material, id]);

  async function look() {
    setState('looking');
    try {
      const rejected = await data.rejections(source.id);
      if (!mounted.current) return;
      const relatedId = possibleConnection(source, data.material, new Set(rejected));
      setState(relatedId ? { id: relatedId } : 'empty');
    } catch {
      if (mounted.current) setState('error');
    }
  }

  async function dismiss(relatedId: string) {
    setState({ id: relatedId, dismissing: true });
    try {
      await data.dismiss(source.id, relatedId);
      if (mounted.current) setState('closed');
    } catch {
      if (mounted.current) setState({ id: relatedId, failed: true });
    }
  }

  return (
    <View key={fontScale} style={{ gap: 8 }}>
      {state === 'closed' ? (
        <ConnectionAction label="look for a connection" onPress={() => void look()} />
      ) : state === 'looking' ? (
        <Text accessibilityLiveRegion="polite" style={type({ size: 14, width: 94, color: ink.far })}>
          looking for shared words…
        </Text>
      ) : (
        <>
          <Text accessibilityRole="header" style={type({ size: 16, width: 94, color: ink.ink })}>
            possible connection
          </Text>
          {connection && typeof state === 'object' ? (
            <>
              <Text style={type({ size: 13, width: 92, color: ink.far })}>shared words in two moments</Text>
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
                {state === 'error' ? 'could not look for a connection' :
                  state === 'empty' ? 'no clear connection found' : 'this connection is no longer available'}
              </Text>
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
