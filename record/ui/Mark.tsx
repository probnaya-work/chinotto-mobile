/**
 * The mark: a ring with dots receding down a column.
 *
 * Three rungs, each **drawn rather than scaled**. The ring's stroke and the dots' radii are
 * specified per rung, so the mark stays legible at 16pt without the stroke thinning to
 * nothing and stays balanced at 94pt without it thickening into a doughnut. Scaling one rung
 * to every size is exactly what the old mark did wrong.
 *
 * All three share the same 64-unit viewBox and the same ring centre, so the rungs are
 * interchangeable at a given size without the lockup shifting.
 */

import React from 'react';
import Svg, { Circle } from 'react-native-svg';

/** Which rung to draw. The prototype picks by size, not by taste. */
export type Rung = 'full' | 'mid' | 'small';

type Dot = { cy: number; r: number };

const RUNGS: Record<Rung, { stroke: number; dots: Dot[] }> = {
  /** ≥ 40pt: the whole idea — three dots, receding. */
  full: {
    stroke: 3,
    dots: [
      { cy: 23, r: 8 },
      { cy: 38, r: 4.5 },
      { cy: 47.5, r: 2.5 },
    ],
  },
  /** 20–40pt: the third dot would close up, so there are two. */
  mid: {
    stroke: 3.5,
    dots: [
      { cy: 23, r: 9 },
      { cy: 40, r: 5 },
    ],
  },
  /** ≤ 20pt: one dot and a heavy ring, which is all that survives. */
  small: {
    stroke: 6,
    dots: [{ cy: 27, r: 11 }],
  },
};

/** The ring radius, which is constant across rungs except for the smallest. */
const RADIUS: Record<Rung, number> = { full: 28, mid: 28, small: 27 };

export function rungFor(size: number): Rung {
  if (size >= 40) return 'full';
  if (size > 20) return 'mid';
  return 'small';
}

export type MarkProps = {
  size: number;
  color?: string;
  /** Override the rung the size would choose. */
  rung?: Rung;
  /** The launch lockup draws a finer ring than the icon at the same size. */
  strokeWidth?: number;
};

export function Mark({ size, color = '#d4d3ce', rung, strokeWidth }: MarkProps) {
  const which = rung ?? rungFor(size);
  const spec = RUNGS[which];
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Circle
        cx={32}
        cy={32}
        r={RADIUS[which]}
        stroke={color}
        strokeWidth={strokeWidth ?? spec.stroke}
        fill="none"
      />
      {spec.dots.map((d) => (
        <Circle key={d.cy} cx={32} cy={d.cy} r={d.r} fill={color} />
      ))}
    </Svg>
  );
}
