import { describe, expect, it } from 'vitest';
import { shouldNavigateOnClick } from './tap';

describe('shouldNavigateOnClick', () => {
  it('navigates immediately for mouse, pen and keyboard', () => {
    expect(shouldNavigateOnClick('mouse', null, 'a')).toBe(true);
    expect(shouldNavigateOnClick('pen', null, 'a')).toBe(true);
    expect(shouldNavigateOnClick('keyboard', null, 'a')).toBe(true);
  });
  it('does not navigate on the first touch tap', () => {
    expect(shouldNavigateOnClick('touch', null, 'a')).toBe(false);
  });
  it('does not navigate on a touch tap of a different segment', () => {
    expect(shouldNavigateOnClick('touch', 'b', 'a')).toBe(false);
  });
  it('navigates on a second touch tap of the same segment', () => {
    expect(shouldNavigateOnClick('touch', 'a', 'a')).toBe(true);
  });
});
