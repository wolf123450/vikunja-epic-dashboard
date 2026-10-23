import { describe, expect, it } from 'vitest';
import { epicDisplayName, epicLabelSlugs, slugify } from './epics.js';

describe('slugify / epicDisplayName', () => {
  it('slugifies titles', () => {
    expect(slugify('Inventory System!')).toBe('inventory-system');
    expect(slugify('  A  --  B/C ')).toBe('a-b-c');
    expect(slugify('!!!')).toBe('');
  });

  it('title-cases slugs', () => {
    expect(epicDisplayName('inventory-system')).toBe('Inventory System');
    expect(epicDisplayName('x')).toBe('X');
  });
});

describe('epicLabelSlugs', () => {
  const cfg = { epicPrefix: 'epic:' };

  it('extracts slugs case-insensitively, trimmed and deduplicated', () => {
    expect(epicLabelSlugs([' Epic: Inventory System ', 'EPIC:inventory-system', 'epic:ui', 'bug'], cfg)).toEqual([
      'inventory-system',
      'ui',
    ]);
  });

  it('ignores empty slugs and the bare marker label', () => {
    expect(epicLabelSlugs(['epic:', 'epic', 'epic:!!'], cfg)).toEqual([]);
  });
});
