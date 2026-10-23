import type { DomainConfig } from './types.js';

/** "Inventory System!" -> "inventory-system". Lowercase, non-alphanumerics collapsed to "-". */
export function slugify(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/** "inventory-system" -> "Inventory System". */
export function epicDisplayName(slug: string): string {
  return slug
    .split('-')
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Slugs from epic:<slug> labels (case-insensitive, trimmed, slugified, deduplicated). */
export function epicLabelSlugs(labels: string[], cfg: Pick<DomainConfig, 'epicPrefix'>): string[] {
  const prefix = cfg.epicPrefix.trim().toLowerCase();
  const out: string[] = [];
  for (const label of labels) {
    const t = label.trim().toLowerCase();
    if (!t.startsWith(prefix)) continue;
    const slug = slugify(t.slice(prefix.length));
    if (slug && !out.includes(slug)) out.push(slug);
  }
  return out;
}
