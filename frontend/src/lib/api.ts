function formatApiErrorBody(status: number, text: string): string {
  const raw = text?.trim()
  if (!raw) return `${status} ${status === 503 ? 'Service unavailable' : 'Request failed'}`
  try {
    const j = JSON.parse(raw) as { detail?: unknown }
    const d = j.detail
    if (typeof d === 'string') return d
    if (Array.isArray(d))
      return d.map((x) => (typeof x === 'object' && x && 'msg' in x ? String((x as { msg: string }).msg) : String(x))).join(
        '; ',
      )
  } catch {
    /* not JSON */
  }
  return raw
}

/** Merge with request init when attributing usage to a workspace (backend verifies membership). */
export function principalHeaders(principalId: string): Record<string, string> {
  return { 'X-Principal-Id': principalId.trim() || 'local-dev' }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(formatApiErrorBody(r.status, t))
  }
  if (r.status === 204) return undefined as T
  return r.json() as Promise<T>
}
