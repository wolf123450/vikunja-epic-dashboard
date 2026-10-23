import type { SyncStatus } from '../../shared/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly sync?: SyncStatus,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
