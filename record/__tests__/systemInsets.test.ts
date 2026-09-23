/**
 * How far the record is lifted clear of Android's system bars. See `record/ui/systemInsets.tsx`.
 */

import { frameInsetsFor } from '../ui/systemInsets';

describe('the frame around the system bars', () => {
  it('is nothing where there is no system inset to answer', () => {
    expect(frameInsetsFor(null)).toEqual({ top: 0, bottom: 0 });
  });

  it('is nothing when the bars fit the design’s own allowance', () => {
    // A 24dp status bar and gesture navigation.
    expect(frameInsetsFor({ top: 24, bottom: 24 })).toEqual({ top: 0, bottom: 0 });
  });

  it('lifts the record clear of a three-button navigation bar', () => {
    // 48dp of buttons, 34 of which the design's own bottom padding already clears.
    expect(frameInsetsFor({ top: 24, bottom: 48 })).toEqual({ top: 0, bottom: 14 });
  });

  it('drops the record below a status bar taller than the design allows', () => {
    expect(frameInsetsFor({ top: 60, bottom: 0 })).toEqual({ top: 6, bottom: 0 });
  });
});
