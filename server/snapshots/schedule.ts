const dtfCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

function parts(ms: number, tz: string) {
  const o: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') o[p.type] = Number(p.value);
  }
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Wall-clock fields in `tz` read as if they were UTC, in ms. */
function wallAsUtc(ms: number, tz: string): number {
  const p = parts(ms, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** Local calendar date (YYYY-MM-DD) in `tz`. */
export function localDate(now: Date, tz: string): string {
  const p = parts(now.getTime(), tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/**
 * UTC instant (ms) at which the wall clock in `tz` reads the given time. A time that falls in a
 * spring-forward gap resolves to the first valid instant after the gap.
 */
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
  const target = Date.UTC(y, mo - 1, d, h, mi);
  let guess = target - (wallAsUtc(target, tz) - target);
  guess = target - (wallAsUtc(guess, tz) - guess);
  const diff = target - wallAsUtc(guess, tz);
  return diff > 0 ? guess + diff : guess;
}

/** Milliseconds from `now` until the next occurrence of `snapshotTime` ('HH:MM') in `tz`. Always > 0. */
export function msUntilNext(snapshotTime: string, tz: string, now: Date): number {
  const m = /^(\d{2}):(\d{2})$/.exec(snapshotTime);
  if (!m) throw new Error(`invalid snapshot time "${snapshotTime}"`);
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const p = parts(now.getTime(), tz);
  for (let add = 0; add < 3; add++) {
    const day = new Date(Date.UTC(p.year, p.month - 1, p.day + add));
    const t = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), h, mi, tz);
    if (t > now.getTime()) return t - now.getTime();
  }
  throw new Error('unreachable: no upcoming snapshot time found');
}

export type DailySnapshotOptions = {
  snapshotTime: string;
  tz: string;
  /** Compute and store the snapshot rows for `date` (YYYY-MM-DD in tz). */
  run: (date: string) => Promise<void>;
  /** True when the store already has rows for `date`. */
  hasDay: (date: string) => boolean;
  now?: () => Date;
  log: { info: (msg: string) => void; error: (msg: string, err?: unknown) => void };
};

/** How long to wait before retrying a failed run for the same date. */
export const RETRY_DELAY_MS = 10 * 60_000;

/**
 * Run now if today has no snapshot, then at every daily `snapshotTime`. Errors are logged, not
 * thrown. A failed run (e.g. no synced model yet) is retried for the same date every
 * RETRY_DELAY_MS while hasDay(date) is still false and the next scheduled run is not due yet.
 */
export function startDailySnapshots(opts: DailySnapshotOptions): { stop(): void } {
  const now = opts.now ?? (() => new Date());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const clearRetry = (): void => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = undefined;
  };

  const runSafe = async (date: string): Promise<void> => {
    try {
      await opts.run(date);
      opts.log.info(`snapshot written for ${date}`);
    } catch (err) {
      opts.log.error(`snapshot for ${date} failed`, err);
      if (stopped || opts.hasDay(date)) return;
      if (RETRY_DELAY_MS >= msUntilNext(opts.snapshotTime, opts.tz, now())) return; // next scheduled run comes first
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        if (!stopped && !opts.hasDay(date)) void runSafe(date);
      }, RETRY_DELAY_MS);
    }
  };

  const arm = (): void => {
    if (stopped) return;
    timer = setTimeout(() => {
      clearRetry();
      void runSafe(localDate(now(), opts.tz)).finally(arm);
    }, msUntilNext(opts.snapshotTime, opts.tz, now()));
  };

  const today = localDate(now(), opts.tz);
  if (opts.hasDay(today)) arm();
  else void runSafe(today).finally(arm);

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      clearRetry();
    },
  };
}
