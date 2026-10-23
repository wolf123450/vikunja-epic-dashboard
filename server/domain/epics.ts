import type { DomainConfig } from './types.js';

/** "Inventory System!" -> "inventory-system". Lowercase, non-alphanumerics collapsed to "-". */
export function slugify(title: string): string {
  void title;
  throw new Error('not implemented');
}

/** "inventory-system" -> "Inventory System". */
export function epicDisplayName(slug: string): string {
  void slug;
  throw new Error('not implemented');
}

/** Slugs from epic:<slug> labels (case-insensitive, trimmed, slugified, deduplicated). */
export function epicLabelSlugs(labels: string[], cfg: Pick<DomainConfig, 'epicPrefix'>): string[] {
  void labels;
  void cfg;
  throw new Error('not implemented');
}
