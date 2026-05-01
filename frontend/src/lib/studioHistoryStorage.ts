/** Persisted Studio generations (browser localStorage). Scoped by workspace customer id when set. */

export type TokenUsage = {
  prompt_eval_count: number | null
  eval_count: number | null
}

export type StudioHistoryGenResult = {
  format_id: string
  tone_id: string
  format_name: string
  tone_name: string
  content: string
  template_ids?: string[]
  template_names?: string[]
  usage?: TokenUsage
}

export type StudioHistoryRun = {
  id: string
  createdAt: string
  brief: string
  outputLanguage: string
  temperature: number
  results: StudioHistoryGenResult[]
  usageSummary: {
    session_totals: TokenUsage
    usage_notes: string
  } | null
}

const STORAGE_PREFIX = 'gigi_studio_history_v1'
const MAX_RUNS = 50

function keyForCustomer(customerId: string | null): string {
  const tail = customerId?.trim() || '__default__'
  return `${STORAGE_PREFIX}:${tail}`
}

function safeParse(raw: string | null): StudioHistoryRun[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return []
    return v.filter(
      (x): x is StudioHistoryRun =>
        x != null &&
        typeof x === 'object' &&
        typeof (x as StudioHistoryRun).id === 'string' &&
        typeof (x as StudioHistoryRun).createdAt === 'string' &&
        Array.isArray((x as StudioHistoryRun).results),
    )
  } catch {
    return []
  }
}

export function loadStudioHistory(customerId: string | null): StudioHistoryRun[] {
  try {
    return safeParse(localStorage.getItem(keyForCustomer(customerId)))
  } catch {
    return []
  }
}

export function saveStudioHistory(customerId: string | null, runs: StudioHistoryRun[]): void {
  try {
    const trimmed = runs.slice(0, MAX_RUNS)
    localStorage.setItem(keyForCustomer(customerId), JSON.stringify(trimmed))
  } catch {
    /* quota / private mode */
  }
}

export function appendStudioHistoryRun(
  customerId: string | null,
  run: Omit<StudioHistoryRun, 'id' | 'createdAt'>,
): StudioHistoryRun {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const full: StudioHistoryRun = {
    ...run,
    id,
    createdAt: new Date().toISOString(),
  }
  const prev = loadStudioHistory(customerId)
  saveStudioHistory(customerId, [full, ...prev])
  return full
}

export function removeStudioHistoryRun(customerId: string | null, id: string): void {
  const prev = loadStudioHistory(customerId)
  saveStudioHistory(
    customerId,
    prev.filter((r) => r.id !== id),
  )
}

export function clearStudioHistory(customerId: string | null): void {
  try {
    localStorage.removeItem(keyForCustomer(customerId))
  } catch {
    /* ignore */
  }
}
