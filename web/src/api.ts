import type {
  EpicDetailResponse,
  EpicsResponse,
  ErrorResponse,
  HygieneResponse,
  ProjectsResponse,
  SyncStatus,
} from '../../shared/api';
import { ApiError } from './api-error';
import { projectsQueryString } from './lib/query';

export { ApiError } from './api-error';

// Dynamic import keeps the mock data out of production bundles (VITE_MOCK is a build-time constant).
const MOCK = import.meta.env.VITE_MOCK === '1';
const mock = () => import('./mock/api');

const FIRST_SYNC_POLL_MS = 1500;
const FIRST_SYNC_MAX_WAIT_MS = 120_000;

/**
 * Like requestOnce, but while the server is still doing its first sync (503 with no success
 * and no error yet) GETs are retried, so a page opened at startup fills in by itself.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const deadline = Date.now() + FIRST_SYNC_MAX_WAIT_MS;
  for (;;) {
    try {
      return await requestOnce<T>(path, init);
    } catch (e) {
      const firstSyncPending =
        e instanceof ApiError &&
        e.status === 503 &&
        e.sync !== undefined &&
        e.sync.lastSuccessAt === null &&
        e.sync.error === null;
      if (!firstSyncPending || (init?.method ?? 'GET') !== 'GET' || Date.now() > deadline) throw e;
      await new Promise((r) => setTimeout(r, FIRST_SYNC_POLL_MS));
    }
  }
}

async function requestOnce<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { accept: 'application/json' } });
  } catch (e) {
    throw new ApiError(`Cannot reach the dashboard server: ${e instanceof Error ? e.message : String(e)}`, 0);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON body; handled below
  }
  if (!res.ok) {
    const err = body as Partial<ErrorResponse> | null;
    throw new ApiError(err?.error ?? `Request failed: ${res.status} ${res.statusText}`, res.status, err?.sync);
  }
  if (body === null) throw new ApiError('The server returned an empty or non-JSON response.', res.status);
  return body as T;
}

export async function getProjects(): Promise<ProjectsResponse> {
  return MOCK ? (await mock()).mockGetProjects() : request('/api/projects');
}

export async function getEpics(ids: number[] | null): Promise<EpicsResponse> {
  return MOCK ? (await mock()).mockGetEpics(ids) : request(`/api/epics${projectsQueryString(ids)}`);
}

export async function getEpicDetail(key: string, ids: number[] | null): Promise<EpicDetailResponse> {
  return MOCK
    ? (await mock()).mockGetEpicDetail(key)
    : request(`/api/epics/${encodeURIComponent(key)}${projectsQueryString(ids)}`);
}

export async function getHygiene(ids: number[] | null): Promise<HygieneResponse> {
  return MOCK ? (await mock()).mockGetHygiene() : request(`/api/hygiene${projectsQueryString(ids)}`);
}

export async function postRefresh(): Promise<SyncStatus> {
  return MOCK ? (await mock()).mockRefresh() : request('/api/refresh', { method: 'POST' });
}
