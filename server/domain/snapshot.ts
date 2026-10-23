import type { Model, SnapshotRow } from './types.js';

/** One row per epic plus one No-epic row (epicSlug '') per rollup root, for `date`. */
export function snapshotRows(model: Model, date: string): SnapshotRow[] {
  void model;
  void date;
  throw new Error('not implemented');
}
