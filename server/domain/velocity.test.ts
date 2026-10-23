import { describe, expect, it } from 'vitest';
import { calendarDate, forecast, isoWeekStart, velocity } from './velocity.js';
import type { WeeklyPoints } from './types.js';
import { task } from './testing.js';

const LA = 'America/Los_Angeles';

describe('calendarDate / isoWeekStart', () => {
  it('uses the configured zone for the calendar date', () => {
    expect(calendarDate(new Date('2026-03-09T06:30:00Z'), LA)).toBe('2026-03-08');
    expect(calendarDate(new Date('2026-03-09T06:30:00Z'), 'UTC')).toBe('2026-03-09');
    expect(calendarDate(new Date('2026-03-09T06:30:00Z'), 'Pacific/Auckland')).toBe('2026-03-09');
  });

  it('puts a Sunday-night-local completion in the previous ISO week, across the DST change', () => {
    // 2026-03-08 is the Sunday PDT began; 23:30 local is 2026-03-09T06:30Z (UTC Monday).
    expect(isoWeekStart(new Date('2026-03-09T06:30:00Z'), LA)).toBe('2026-03-02');
    expect(isoWeekStart(new Date('2026-03-09T06:30:00Z'), 'UTC')).toBe('2026-03-09');
  });

  it('rolls over at local midnight on Monday', () => {
    // PDT: Monday 2026-03-09 00:00 local = 07:00Z.
    expect(isoWeekStart(new Date('2026-03-09T06:59:59Z'), LA)).toBe('2026-03-02');
    expect(isoWeekStart(new Date('2026-03-09T07:00:00Z'), LA)).toBe('2026-03-09');
    // PST: Monday 2026-11-02 00:00 local = 08:00Z (DST ended 2026-11-01).
    expect(isoWeekStart(new Date('2026-11-02T07:59:59Z'), LA)).toBe('2026-10-26');
    expect(isoWeekStart(new Date('2026-11-02T08:00:00Z'), LA)).toBe('2026-11-02');
  });

  it('handles year boundaries', () => {
    expect(isoWeekStart(new Date('2026-01-01T12:00:00Z'), 'UTC')).toBe('2025-12-29');
  });
});

describe('velocity', () => {
  const done = (id: number, at: string, points: number | null) => task(id, { done: true, doneAt: new Date(at), points });
  const now = new Date('2026-03-12T18:00:00Z'); // Thursday, week of 2026-03-09

  it('fills empty weeks and ends with the current week, oldest first', () => {
    const v = velocity([], LA, now, 4);
    expect(v.map((w) => w.weekStart)).toEqual(['2026-02-16', '2026-02-23', '2026-03-02', '2026-03-09']);
    expect(v.every((w) => w.points === 0 && w.tasks === 0)).toBe(true);
  });

  it('buckets by local week and counts unpointed done tasks as tasks only', () => {
    const v = velocity(
      [
        done(1, '2026-03-09T06:30:00Z', 3), // Sunday 23:30 PDT -> week of 03-02
        done(2, '2026-03-09T07:30:00Z', 5), // Monday 00:30 PDT -> week of 03-09
        done(3, '2026-03-10T20:00:00Z', null),
        task(4, { points: 8 }), // open: ignored
        done(5, '2025-01-01T00:00:00Z', 13), // outside window: ignored
      ],
      LA,
      now,
      3,
    );
    expect(v).toEqual([
      { weekStart: '2026-02-23', points: 0, tasks: 0 },
      { weekStart: '2026-03-02', points: 3, tasks: 1 },
      { weekStart: '2026-03-09', points: 5, tasks: 2 },
    ]);
  });

  it('defaults to 12 weeks', () => {
    expect(velocity([], LA, now)).toHaveLength(12);
  });
});

describe('forecast', () => {
  const w = (...points: number[]): WeeklyPoints[] =>
    points.map((p, i) => ({ weekStart: `2026-01-${String(i + 1).padStart(2, '0')}`, points: p, tasks: p > 0 ? 1 : 0 }));

  it('gives a range from the trailing 4 weeks', () => {
    expect(forecast(30, w(5, 10, 5, 10))).toEqual({ weeksLow: 3, weeksHigh: 6 });
  });

  it('uses only the last 4 weeks', () => {
    expect(forecast(20, w(100, 5, 10, 5, 10))).toEqual({ weeksLow: 2, weeksHigh: 4 });
  });

  it('uses the mean for the high end when a week had zero points', () => {
    expect(forecast(30, w(10, 0, 5, 5))).toEqual({ weeksLow: 3, weeksHigh: 6 });
  });

  it('ignores leading weeks before the first completion', () => {
    expect(forecast(10, w(0, 0, 0, 5, 5))).toBeNull(); // only 2 usable weeks
    expect(forecast(10, w(0, 0, 5, 5, 5))).toEqual({ weeksLow: 2, weeksHigh: 2 });
  });

  it('returns null with too little history, nothing remaining, or no points', () => {
    expect(forecast(10, w(5, 5))).toBeNull();
    expect(forecast(0, w(5, 5, 5, 5))).toBeNull();
    expect(forecast(-1, w(5, 5, 5, 5))).toBeNull();
    expect(forecast(10, w(0, 0, 0, 0))).toBeNull();
    expect(forecast(10, [])).toBeNull();
  });

  it('rounds to one decimal', () => {
    expect(forecast(10, w(3, 3, 3))).toEqual({ weeksLow: 3.3, weeksHigh: 3.3 });
  });
});
