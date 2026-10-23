import type { EpicStatus, FlagType } from '../../../shared/api';

export function percent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (done / total) * 100));
}

/** Calendar date (YYYY-MM-DD) from an ISO timestamp or date; '-' when missing. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  return iso.slice(0, 10);
}

export function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** "5 min ago", "3 h ago", "2 d ago"; 'never' when missing. */
export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const secs = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export const STATUS_LABELS: Record<EpicStatus, string> = {
  'in-progress': 'In progress',
  'not-started': 'Not started',
  done: 'Done',
};

export const FLAG_LABELS: Record<FlagType, string> = {
  'conflicting-points': 'Conflicting points',
  'invalid-points': 'Invalid points',
  'off-scale-points': 'Off-scale points',
  oversized: 'Oversized',
  'unpointed-open': 'Unpointed',
  'no-epic': 'No epic',
  'epic-overlap': 'Epic overlap',
  'subtask-cycle': 'Subtask cycle',
  'done-bucket-mismatch': 'Done/bucket mismatch',
};

export function forecastText(forecast: { weeksLow: number; weeksHigh: number } | null): string | null {
  if (!forecast) return null;
  const { weeksLow, weeksHigh } = forecast;
  if (weeksLow === weeksHigh) return `Forecast: about ${weeksLow} ${weeksLow === 1 ? 'week' : 'weeks'} to finish`;
  return `Forecast: ${weeksLow} to ${weeksHigh} weeks to finish`;
}

/** SVG polyline points for a sparkline in a w x h box. */
export function sparklinePoints(values: readonly number[], w: number, h: number, pad = 2): string {
  if (values.length === 0) return '';
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - (v / max) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
