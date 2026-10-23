import type { DomainConfig, Flag } from './types.js';

const NUMBER_RE = /^(\d+(\.\d*)?|\.\d+)$/;

function parseValue(raw: string): number | null {
  if (!NUMBER_RE.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Parse story points from a task's label titles. Case-insensitive, whitespace-tolerant
 * ("SP: 5", "sp:5", "sp: 0.5"). Any positive finite number counts.
 * - no sp: label -> points null, no flags
 * - non-numeric or <= 0 -> 'invalid-points' flag, not counted
 * - several valid values -> highest used, 'conflicting-points' flag
 * - cfg.pointsScale set and value not on it -> 'off-scale-points' flag, still counted
 * - value > cfg.pointsSplitThreshold -> 'oversized' flag, still counted
 */
export function parsePoints(
  labels: string[],
  cfg: Pick<DomainConfig, 'pointsPrefix' | 'pointsScale' | 'pointsSplitThreshold'>,
): { points: number | null; flags: Flag[] } {
  const prefix = cfg.pointsPrefix.trim().toLowerCase();
  const flags: Flag[] = [];
  const valid: number[] = [];

  for (const label of labels) {
    const t = label.trim().toLowerCase();
    if (!t.startsWith(prefix)) continue;
    const raw = t.slice(prefix.length).trim();
    const value = parseValue(raw);
    if (value === null) {
      flags.push({ type: 'invalid-points', detail: `"${t}" is not a positive number` });
    } else {
      valid.push(value);
    }
  }

  if (valid.length === 0) return { points: null, flags };

  const distinct = [...new Set(valid)].sort((a, b) => a - b);
  const points = distinct[distinct.length - 1]!;
  if (distinct.length > 1) {
    flags.push({ type: 'conflicting-points', detail: `labels ${distinct.join(', ')}; using ${points}` });
  }
  if (cfg.pointsScale && !cfg.pointsScale.includes(points)) {
    flags.push({ type: 'off-scale-points', detail: `${points} is not on the scale ${cfg.pointsScale.join(', ')}` });
  }
  if (points > cfg.pointsSplitThreshold) {
    flags.push({ type: 'oversized', detail: `${points} points is above ${cfg.pointsSplitThreshold}; consider splitting` });
  }
  return { points, flags };
}
