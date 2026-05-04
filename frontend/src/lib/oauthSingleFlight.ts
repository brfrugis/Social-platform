/** One promise per key so Strict Mode / remounts do not run the same OAuth exchange twice. */
const inflight = new Map<string, Promise<unknown>>()

export function runOAuthExchangeOnce<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined
  if (existing) return existing
  const p = fn().finally(() => {
    inflight.delete(key)
  })
  inflight.set(key, p)
  return p
}
