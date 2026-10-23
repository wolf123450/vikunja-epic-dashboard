import { describe, expect, it } from 'vitest';
import { parsePoints } from './points.js';

const base = { pointsPrefix: 'sp:', pointsScale: null, pointsSplitThreshold: 5 };
const types = (r: ReturnType<typeof parsePoints>) => r.flags.map((f) => f.type);

describe('parsePoints', () => {
  it('returns null and no flags without an sp label', () => {
    expect(parsePoints(['bug', 'epic:x'], base)).toEqual({ points: null, flags: [] });
  });

  it.each([
    ['sp:5', 5],
    ['SP:5', 5],
    ['sp: 5', 5],
    ['  Sp:   3  ', 3],
    ['sp:0.5', 0.5],
    ['sp: 2.5', 2.5],
    ['sp:.5', 0.5],
  ])('parses %j as %d', (label, expected) => {
    expect(parsePoints([label], base).points).toBe(expected);
  });

  it.each(['sp:big', 'sp:0', 'sp:-3', 'sp:', 'sp:1e3', 'sp:5 pts', 'sp:0.0'])('flags %j as invalid', (label) => {
    const r = parsePoints([label], base);
    expect(r.points).toBeNull();
    expect(types(r)).toEqual(['invalid-points']);
    expect(r.flags[0]!.detail).toContain('not a positive number');
  });

  it('uses the highest of several values and flags the conflict', () => {
    const r = parsePoints(['sp:3', 'sp:5'], base);
    expect(r.points).toBe(5);
    expect(types(r)).toEqual(['conflicting-points']);
    expect(r.flags[0]!.detail).toBe('labels 3, 5; using 5');
  });

  it('does not flag a duplicated identical value', () => {
    expect(parsePoints(['sp:3', 'SP: 3'], base)).toEqual({ points: 3, flags: [] });
  });

  it('still counts a valid value next to an invalid one', () => {
    const r = parsePoints(['sp:big', 'sp:2'], base);
    expect(r.points).toBe(2);
    expect(types(r)).toEqual(['invalid-points']);
  });

  it('flags off-scale values only when a scale is configured', () => {
    expect(types(parsePoints(['sp:4'], base))).toEqual([]);
    const scaled = { ...base, pointsScale: [1, 2, 3, 5, 8] };
    const off = parsePoints(['sp:4'], scaled);
    expect(off.points).toBe(4);
    expect(types(off)).toEqual(['off-scale-points']);
    expect(types(parsePoints(['sp:5'], scaled))).toEqual([]);
  });

  it('flags oversized values above the threshold, not at it', () => {
    expect(types(parsePoints(['sp:5'], base))).toEqual([]);
    const r = parsePoints(['sp:8'], base);
    expect(r.points).toBe(8);
    expect(types(r)).toEqual(['oversized']);
    expect(types(parsePoints(['sp:5.5'], base))).toEqual(['oversized']);
  });

  it('honours a custom prefix', () => {
    const cfg = { ...base, pointsPrefix: 'pts-' };
    expect(parsePoints(['PTS-8', 'sp:2'], cfg).points).toBe(8);
  });
});
