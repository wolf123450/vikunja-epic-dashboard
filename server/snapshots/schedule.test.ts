import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localDate, msUntilNext, startDailySnapshots } from './schedule.js';

const H = 3_600_000;
const TZ = 'America/Los_Angeles';

describe('localDate', () => {
  it('uses the zone, not UTC', () => {
    expect(localDate(new Date('2026-10-23T06:30:00Z'), TZ)).toBe('2026-10-22');
    expect(localDate(new Date('2026-10-23T07:30:00Z'), TZ)).toBe('2026-10-23');
  });
});

describe('msUntilNext', () => {
  it('same day when the time is still ahead', () => {
    // 2026-10-23 01:00 PDT -> 03:00 PDT
    expect(msUntilNext('03:00', TZ, new Date('2026-10-23T08:00:00Z'))).toBe(2 * H);
  });

  it('next day when the time has passed, and a full day when exactly at it', () => {
    expect(msUntilNext('03:00', TZ, new Date('2026-10-23T11:00:00Z'))).toBe(23 * H); // 04:00 PDT
    expect(msUntilNext('03:00', TZ, new Date('2026-10-23T10:00:00Z'))).toBe(24 * H); // exactly 03:00 PDT
  });

  it('crosses midnight', () => {
    // 2026-10-22 23:30 PDT -> 00:30 PDT
    expect(msUntilNext('00:30', TZ, new Date('2026-10-23T06:30:00Z'))).toBe(1 * H);
  });

  it('is short across spring-forward (2026-03-08)', () => {
    // 2026-03-07 04:00 PST -> 2026-03-08 03:00 PDT = 22h of real time
    expect(msUntilNext('03:00', TZ, new Date('2026-03-07T12:00:00Z'))).toBe(22 * H);
  });

  it('is long across fall-back (2026-11-01)', () => {
    // 2026-10-31 04:00 PDT -> 2026-11-01 03:00 PST = 24h of real time (day has 25h)
    expect(msUntilNext('03:00', TZ, new Date('2026-10-31T11:00:00Z'))).toBe(24 * H);
    // 2026-10-31 01:00 PDT -> 03:00 same day is 2h; next-day case from 03:00 PDT is 25h
    expect(msUntilNext('03:00', TZ, new Date('2026-10-31T10:00:00Z'))).toBe(25 * H);
  });

  it('a time inside the spring-forward gap runs right after the gap', () => {
    // 02:30 does not exist on 2026-03-08; resolves to 03:00-ish PDT (>= 10:00Z)
    const ms = msUntilNext('02:30', TZ, new Date('2026-03-08T09:00:00Z')); // 01:00 PST
    expect(ms).toBeGreaterThanOrEqual(1 * H);
    expect(ms).toBeLessThanOrEqual(2.5 * H);
  });

  it('rejects malformed times', () => {
    expect(() => msUntilNext('3am', TZ, new Date())).toThrow();
  });
});

describe('startDailySnapshots', () => {
  const log = { info: vi.fn(), error: vi.fn() };

  beforeEach(() => {
    vi.useFakeTimers();
    log.info.mockClear();
    log.error.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('runs immediately when today has no snapshot, then daily', async () => {
    vi.setSystemTime(new Date('2026-10-23T18:00:00Z')); // 11:00 PDT
    const run = vi.fn().mockResolvedValue(undefined);
    const job = startDailySnapshots({ snapshotTime: '03:00', tz: TZ, run, hasDay: () => false, log });
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenLastCalledWith('2026-10-23');

    await vi.advanceTimersByTimeAsync(16 * H + 1000); // past 03:00 PDT on the 24th (16h)
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith('2026-10-24');

    await vi.advanceTimersByTimeAsync(24 * H);
    expect(run).toHaveBeenCalledTimes(3);
    expect(run).toHaveBeenLastCalledWith('2026-10-25');
    job.stop();
  });

  it('skips the immediate run when today already has a snapshot', async () => {
    vi.setSystemTime(new Date('2026-10-23T18:00:00Z'));
    const run = vi.fn().mockResolvedValue(undefined);
    const job = startDailySnapshots({ snapshotTime: '03:00', tz: TZ, run, hasDay: () => true, log });
    await vi.advanceTimersByTimeAsync(15 * H);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2 * H);
    expect(run).toHaveBeenCalledTimes(1);
    job.stop();
  });

  it('logs errors and keeps scheduling', async () => {
    vi.setSystemTime(new Date('2026-10-23T18:00:00Z'));
    let stored = false;
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockImplementation(async () => {
        stored = true;
      });
    const job = startDailySnapshots({ snapshotTime: '03:00', tz: TZ, run, hasDay: () => stored, log });
    await vi.advanceTimersByTimeAsync(0);
    expect(log.error).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10 * 60_000); // retry for today succeeds
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(16 * H); // the next scheduled run still happens
    expect(run).toHaveBeenCalledTimes(3);
    expect(run).toHaveBeenLastCalledWith('2026-10-24');
    job.stop();
  });

  it('retries a failed run for the same date every 10 minutes until it succeeds', async () => {
    vi.setSystemTime(new Date('2026-10-23T18:00:00Z')); // 11:00 PDT
    let stored = false;
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('no synced data yet'))
      .mockRejectedValueOnce(new Error('still no data'))
      .mockImplementation(async () => {
        stored = true;
      });
    const job = startDailySnapshots({ snapshotTime: '03:00', tz: TZ, run, hasDay: () => stored, log });
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10 * 60_000 - 1);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(run).toHaveBeenCalledTimes(3);
    expect(run.mock.calls.map((c) => c[0])).toEqual(['2026-10-23', '2026-10-23', '2026-10-23']);

    await vi.advanceTimersByTimeAsync(2 * H); // stored: no more retries
    expect(run).toHaveBeenCalledTimes(3);
    job.stop();
  });

  it('stops retrying once the day appears in the store or the next scheduled run is due', async () => {
    vi.setSystemTime(new Date('2026-10-23T18:00:00Z'));
    let stored = false;
    const run = vi.fn().mockRejectedValue(new Error('down'));
    const job = startDailySnapshots({ snapshotTime: '03:00', tz: TZ, run, hasDay: () => stored, log });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(run).toHaveBeenCalledTimes(2);
    stored = true; // e.g. written elsewhere
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(run).toHaveBeenCalledTimes(2);
    job.stop();
  });

  it('does not retry when the next scheduled run is less than 10 minutes away', async () => {
    vi.setSystemTime(new Date('2026-10-23T09:55:00Z')); // 02:55 PDT, 5 min before 03:00
    const run = vi.fn().mockRejectedValue(new Error('down'));
    const job = startDailySnapshots({ snapshotTime: '03:00', tz: TZ, run, hasDay: () => false, log });
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * 60_000); // scheduled run at 03:00 (fails again, too)
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith('2026-10-23');
    job.stop();
  });

  it('stop() cancels a pending retry', async () => {
    vi.setSystemTime(new Date('2026-10-23T18:00:00Z'));
    const run = vi.fn().mockRejectedValue(new Error('down'));
    const job = startDailySnapshots({ snapshotTime: '03:00', tz: TZ, run, hasDay: () => false, log });
    await vi.advanceTimersByTimeAsync(0);
    job.stop();
    await vi.advanceTimersByTimeAsync(H);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('stop() cancels future runs', async () => {
    vi.setSystemTime(new Date('2026-10-23T18:00:00Z'));
    const run = vi.fn().mockResolvedValue(undefined);
    const job = startDailySnapshots({ snapshotTime: '03:00', tz: TZ, run, hasDay: () => true, log });
    job.stop();
    await vi.advanceTimersByTimeAsync(48 * H);
    expect(run).not.toHaveBeenCalled();
  });
});
