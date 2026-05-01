import { api } from './api'

/** Tenant-scoped API calls (Phase 4). Mirrors backend `X-Principal-Id`. */
export async function tenantApi<T>(
  principalId: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const pid = principalId.trim() || 'local-dev'
  return api<T>(path, {
    ...init,
    headers: {
      'X-Principal-Id': pid,
      ...init?.headers,
    },
  })
}
