import type { ViewToken } from 'react-native';

import { scrollFocusFromViewable } from '../ui/RecordList';
import type { Row } from '../ui/rows';

const moment = (key: string): Row =>
  ({
    kind: 'moment',
    key,
    tier: 0,
    gap: 0,
    material: { id: key },
  }) as Row;

const token = (item: Row, index: number, isViewable = true) =>
  ({ item, index, isViewable }) as ViewToken<Row>;

describe('scrollFocusFromViewable', () => {
  it('focuses the middle visible thought and moves its visual neighbours apart', () => {
    expect(
      scrollFocusFromViewable([
        token(moment('below'), 10),
        token(moment('active'), 11),
        token(moment('above'), 12),
      ])
    ).toEqual({
      activeKey: 'active',
      aboveKey: 'above',
      belowKey: 'below',
    });
  });

  it('ignores labels and non-viewable thoughts', () => {
    const label = { kind: 'bandLabel', key: 'label', label: 'today' } as Row;

    expect(
      scrollFocusFromViewable([
        token(label, 4),
        token(moment('hidden'), 5, false),
        token(moment('only'), 6),
      ])
    ).toEqual({ activeKey: 'only', aboveKey: null, belowKey: null });
  });
});
