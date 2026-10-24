import { describe, expect, it } from 'vitest';
import type { EpicDTO, RollupDTO } from '../../../shared/api';
import { sortEpics } from './sort';

const rollup = (r: Partial<RollupDTO> = {}): RollupDTO => ({
  pointsTotal: 0,
  pointsDone: 0,
  tasksTotal: 0,
  tasksDone: 0,
  unpointedOpen: 0,
  status: 'not-started',
  lastCompletedAt: null,
  firstCreatedAt: null,
  lastUpdatedAt: null,
  buckets: [],
  ...r,
});
const epic = (name: string, e: Partial<EpicDTO> = {}, r: Partial<RollupDTO> = {}): EpicDTO => ({
  key: `1:${name}`,
  slug: name,
  name,
  isNoEpic: false,
  source: 'label',
  rootProjectId: 1,
  rootProjectTitle: 'P',
  parentTask: null,
  createdAt: null,
  lastActivityAt: null,
  rollup: rollup(r),
  ...e,
});
const names = (es: EpicDTO[]): string[] => es.map((e) => e.name);

describe('sortEpics', () => {
  const noEpic = epic('No epic', { isNoEpic: true, lastActivityAt: '2030-01-01T00:00:00Z' });
  const a = epic('alpha', { lastActivityAt: '2026-01-02T00:00:00Z', createdAt: '2025-01-01T00:00:00Z' }, { pointsTotal: 10, pointsDone: 5 });
  const b = epic('Beta', { lastActivityAt: '2026-03-01T00:00:00Z' }, { pointsTotal: 4, pointsDone: 4 });
  const c = epic('charlie', {}, { pointsTotal: 0 });
  const input = [b, noEpic, c, a];

  it('keeps server order for status, reversible, with No epic last', () => {
    expect(names(sortEpics(input, 'status', 'asc'))).toEqual(['Beta', 'charlie', 'alpha', 'No epic']);
    expect(names(sortEpics(input, 'status', 'desc'))).toEqual(['alpha', 'charlie', 'Beta', 'No epic']);
  });

  it('sorts names case-insensitively', () => {
    expect(names(sortEpics(input, 'name', 'asc'))).toEqual(['alpha', 'Beta', 'charlie', 'No epic']);
    expect(names(sortEpics(input, 'name', 'desc'))).toEqual(['charlie', 'Beta', 'alpha', 'No epic']);
  });

  it('puts missing dates last in both directions', () => {
    expect(names(sortEpics(input, 'activity', 'desc'))).toEqual(['Beta', 'alpha', 'charlie', 'No epic']);
    expect(names(sortEpics(input, 'activity', 'asc'))).toEqual(['alpha', 'Beta', 'charlie', 'No epic']);
    expect(names(sortEpics(input, 'created', 'desc'))).toEqual(['alpha', 'Beta', 'charlie', 'No epic']);
  });

  it('sorts by progress, treating unpointed epics as unknown', () => {
    expect(names(sortEpics(input, 'progress', 'desc'))).toEqual(['Beta', 'alpha', 'charlie', 'No epic']);
    expect(names(sortEpics(input, 'remaining', 'desc'))).toEqual(['alpha', 'Beta', 'charlie', 'No epic']);
  });
});
