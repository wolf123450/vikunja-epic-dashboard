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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
