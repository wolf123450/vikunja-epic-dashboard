import type { ProjectDTO } from '../../../shared/api';

export type PickerRow = { project: ProjectDTO; depth: number };

/** Depth-first rows (children under their parent). With a filter, keeps matches plus their ancestors. */
export function buildPickerRows(projects: readonly ProjectDTO[], filter = ''): PickerRow[] {
  const ids = new Set(projects.map((p) => p.id));
  const children = new Map<number | null, ProjectDTO[]>();
  for (const p of projects) {
    const parent = p.parentId !== null && ids.has(p.parentId) ? p.parentId : null;
    const list = children.get(parent) ?? [];
    list.push(p);
    children.set(parent, list);
  }
  const needle = filter.trim().toLowerCase();
  const matches = (p: ProjectDTO): boolean => needle === '' || p.title.toLowerCase().includes(needle);
  const keep = new Map<number, boolean>();
  const subtreeMatches = (p: ProjectDTO): boolean => {
    const cached = keep.get(p.id);
    if (cached !== undefined) return cached;
    keep.set(p.id, false); // guards against parent cycles
    const result = matches(p) || (children.get(p.id) ?? []).some(subtreeMatches);
    keep.set(p.id, result);
    return result;
  };
  const rows: PickerRow[] = [];
  const seen = new Set<number>();
  const walk = (parent: number | null, depth: number): void => {
    for (const p of children.get(parent) ?? []) {
      if (seen.has(p.id) || !subtreeMatches(p)) continue;
      seen.add(p.id);
      rows.push({ project: p, depth });
      walk(p.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

export function selectionLabel(projects: readonly ProjectDTO[], selected: readonly number[]): string {
  if (selected.length === 0) return 'No projects';
  const titles = selected.map((id) => projects.find((p) => p.id === id)?.title ?? `#${id}`);
  if (titles.length <= 2) return titles.join(', ');
  return `${titles[0]}, ${titles[1]} +${titles.length - 2}`;
}
