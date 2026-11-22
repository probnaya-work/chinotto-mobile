import type { Entry } from '../../types/entry';
import { entriesNewestFirstForWidget } from '../widgetThoughtsBridge';

describe('widgetThoughtsBridge', () => {
  it('sorts entries newest-first by createdAt', () => {
    const a: Entry = { id: 'a', text: 'old', createdAt: '2020-01-01T00:00:00.000Z' };
    const b: Entry = { id: 'b', text: 'new', createdAt: '2024-06-01T12:00:00.000Z' };
    const c: Entry = { id: 'c', text: 'mid', createdAt: '2022-01-01T00:00:00.000Z' };
    expect(entriesNewestFirstForWidget([a, b, c]).map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('uses id as tie-breaker when createdAt is equal', () => {
    const t = '2024-01-01T00:00:00.000Z';
    const x: Entry = { id: 'x', text: '1', createdAt: t };
    const y: Entry = { id: 'y', text: '2', createdAt: t };
    expect(entriesNewestFirstForWidget([x, y]).map((e) => e.id)).toEqual(['y', 'x']);
  });
});
