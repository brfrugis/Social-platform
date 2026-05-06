import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  defaultLlmPrefs,
  loadLlmPrefs,
  saveLlmPrefs,
  type LlmUserPrefs,
} from '../lib/llmSettingsStorage'

type LlmSettingsCtx = {
  prefs: LlmUserPrefs
  setPrefs: (next: LlmUserPrefs) => void
  resetPrefs: () => void
}

const Ctx = createContext<LlmSettingsCtx | null>(null)

export function LlmSettingsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefsState] = useState<LlmUserPrefs>(() => loadLlmPrefs())

  const setPrefs = useCallback((next: LlmUserPrefs) => {
    setPrefsState(next)
    saveLlmPrefs(next)
  }, [])

  const resetPrefs = useCallback(() => {
    setPrefsState({ ...defaultLlmPrefs })
    saveLlmPrefs({ ...defaultLlmPrefs })
  }, [])

  const value = useMemo(
    () => ({
      prefs,
      setPrefs,
      resetPrefs,
    }),
    [prefs, setPrefs, resetPrefs],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLlmSettings(): LlmSettingsCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLlmSettings must be used within LlmSettingsProvider')
  return v
}
