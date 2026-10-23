import type {
  EpicDetailResponse,
  EpicsResponse,
  HygieneResponse,
  ProjectsResponse,
  SyncStatus,
} from '../../../shared/api';
import { ApiError } from '../api-error';
import {
  MOCK_DEFAULT_SELECTION,
  mockBuckets,
  mockBurnup,
  mockEpics,
  mockHygiene,
  mockProjects,
  mockVelocity,
  sumRollups,
} from './data';

// `?mockError=1`: data loads but the last sync failed (revoked token). `?mockError=2`: the API itself errors.
// Read once at load so it survives in-app navigation, which drops unrelated query params.
const mockErrorMode = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('mockError');

let lastSuccessAt = '2026-06-15T08:00:00.000Z';
let refreshCount = 0;

function sync(): SyncStatus {
  return {
    lastSuccessAt,
    lastAttemptAt: lastSuccessAt,
    error: mockErrorMode === '1' ? 'Vikunja rejected the API token (401 Unauthorized). Create a new token and restart the dashboard.' : null,
    vikunjaVersion: '0.0.0-mock',
    syncing: false,
  };
}

async function delay<T>(value: T): Promise<T> {
  await new Promise((r) => setTimeout(r, 120));
  if (mockErrorMode === '2') throw new ApiError('Mock API error: the dashboard server is unreachable (simulated).', 502, sync());
  return value;
}

function rootsOf(ids: number[] | null): Set<number> {
  const selection = ids ?? MOCK_DEFAULT_SELECTION;
  return new Set(selection.map((id) => mockProjects.find((p) => p.id === id)?.rootId).filter((x): x is number => x !== undefined));
}

export function mockGetProjects(): Promise<ProjectsResponse> {
  return delay({ projects: mockProjects, defaultSelection: MOCK_DEFAULT_SELECTION, sync: sync() });
}

export function mockGetEpics(ids: number[] | null): Promise<EpicsResponse> {
  const roots = rootsOf(ids);
  const epics = mockEpics.filter((e) => roots.has(e.dto.rootProjectId)).map((e) => e.dto);
  return delay({
    buckets: mockBuckets,
    epics,
    totals: sumRollups(epics.map((e) => e.rollup)),
    velocity: mockVelocity(),
    sync: sync(),
  });
}

export async function mockGetEpicDetail(key: string): Promise<EpicDetailResponse> {
  const epic = mockEpics.find((e) => e.dto.key === key);
  if (!epic) throw new ApiError(`Epic "${key}" not found`, 404, sync());
  return delay({
    epic: epic.dto,
    buckets: mockBuckets,
    tasks: epic.tasks,
    burnup: mockBurnup(epic.dto),
    forecast: epic.dto.rollup.status === 'in-progress' ? { weeksLow: 3, weeksHigh: 5 } : null,
    sync: sync(),
  });
}

export function mockGetHygiene(): Promise<HygieneResponse> {
  return delay({ ...mockHygiene(), sync: sync() });
}

export async function mockRefresh(): Promise<SyncStatus> {
  refreshCount++;
  lastSuccessAt = new Date(Date.UTC(2026, 5, 15, 8, 0) + refreshCount * 60_000).toISOString();
  return delay(sync());
}
