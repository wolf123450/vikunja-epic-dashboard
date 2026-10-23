import { describe, expect, it } from 'vitest';
import { reconstructBurnup } from './burnup.js';
import { task } from './testing.js';

const LA = 'America/Los_Angeles';
const at = (s: string) => new Date(s);

describe('reconstructBurnup', () => {
  it('returns nothing for no tasks', () => {
    expect(reconstructBurnup([], LA, at('2026-03-10T00:00:00Z'))).toEqual([]);
  });

  it('emits one point per calendar day, cumulative, inclusive of today', () => {
    const tasks = [
      task(1, { createdAt: at('2026-03-01T20:00:00Z'), points: 3, done: true, doneAt: at('2026-03-03T20:00:00Z') }),
      task(2, { createdAt: at('2026-03-02T20:00:00Z'), points: 5 }),
      task(3, { createdAt: at('2026-03-02T20:00:00Z'), done: true, doneAt: at('2026-03-04T20:00:00Z') }),
    ];
    const b = reconstructBurnup(tasks, LA, at('2026-03-04T21:00:00Z'));
    expect(b.map((p) => [p.date, p.scopePoints, p.donePoints, p.scopeTasks, p.doneTasks])).toEqual([
      ['2026-03-01', 3, 0, 1, 0],
      ['2026-03-02', 8, 0, 3, 0],
      ['2026-03-03', 8, 3, 3, 1],
      ['2026-03-04', 8, 3, 3, 2],
    ]);
    expect(b.every((p) => p.source === 'reconstructed')).toBe(true);
  });

  it('uses the configured time zone for days', () => {
    // 2026-03-02T03:00Z is still 2026-03-01 in Los Angeles.
    const b = reconstructBurnup([task(1, { createdAt: at('2026-03-02T03:00:00Z'), points: 2 })], LA, at('2026-03-02T20:00:00Z'));
    expect(b.map((p) => p.date)).toEqual(['2026-03-01', '2026-03-02']);
    expect(b[0]!.scopePoints).toBe(2);
  });

  it('spans a DST change without skipping or repeating days', () => {
    const b = reconstructBurnup([task(1, { createdAt: at('2026-03-06T20:00:00Z') })], LA, at('2026-03-11T20:00:00Z'));
    expect(b.map((p) => p.date)).toEqual(['2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10', '2026-03-11']);
  });

  it('ignores doneAt on open tasks', () => {
    const b = reconstructBurnup(
      [task(1, { createdAt: at('2026-03-01T20:00:00Z'), points: 3, doneAt: at('2026-03-02T20:00:00Z') })],
      LA,
      at('2026-03-02T21:00:00Z'),
    );
    expect(b.at(-1)).toMatchObject({ donePoints: 0, doneTasks: 0 });
  });
});
