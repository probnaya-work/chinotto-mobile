/**
 * Text with the matched words shown as matched.
 *
 * Everywhere the record claims a connection — a Return's reason, a trace, a Find result — it
 * highlights the words the claim rests on, inside the wording as it was actually written.
 * That is what makes the claim checkable rather than asserted, so the highlight is not
 * decoration and this component is not optional.
 */

import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';

import { evidence, wash } from './tokens';
import type { TextPart } from '../model/words';

export type MarkedProps = TextProps & {
  parts: TextPart[];
  style?: TextStyle | TextStyle[];
  /** The quieter wash used inside a trace row. */
  quiet?: boolean;
  /**
   * Matched text lifts ABOVE material, whatever tier surrounds it — that is what makes a
   * highlight raise readability rather than merely tint the words.
   */
  matchColor?: string;
};

export function Marked({ parts, style, quiet, matchColor = evidence.ink, ...rest }: MarkedProps) {
  return (
    <Text style={style} {...rest}>
      {parts.map((part, i) =>
        part.m ? (
          <Text
            // Parts are positional within one string; the index is the only stable identity
            // they have, and the list is rebuilt whenever the string or phrase changes.
            key={i}
            style={{
              backgroundColor: quiet ? wash.matchTrace : wash.match,
              color: matchColor,
            }}
          >
            {part.t}
          </Text>
        ) : (
          <Text key={i}>{part.t}</Text>
        )
      )}
    </Text>
  );
}
