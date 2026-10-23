import type { VikunjaProject } from '../vikunja/schemas.js';
import type { DomainConfig, Model, ProjectData } from './types.js';

/**
 * Normalize fetched data into the domain model:
 * - rollup roots from project ancestry (allProjects) when cfg.includeChildProjects
 * - points and flags per task (parsePoints)
 * - epics per cfg.epicMode: label epics, parent epics (marker label + recursive subtasks,
 *   cycle-safe), and 'both' merging by slug (see SPEC.md "Merging in both mode"); epics are
 *   keyed by root + slug, so the same slug in a parent and its child merges, but not across roots
 * - buckets per root: root's board first, child boards matched by name and unmatched appended
 * - no-epic, unpointed-open, epic-overlap, done-bucket-mismatch flags
 * - doneAt null for open tasks; url = cfg.vikunjaPublicUrl + '/tasks/' + id
 */
export function buildModel(data: ProjectData[], allProjects: VikunjaProject[], cfg: DomainConfig): Model {
  void data;
  void allProjects;
  void cfg;
  throw new Error('not implemented');
}
