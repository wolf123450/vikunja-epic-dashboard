import type { DomainConfig, Flag } from './types.js';

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
  void labels;
  void cfg;
  throw new Error('not implemented');
}
