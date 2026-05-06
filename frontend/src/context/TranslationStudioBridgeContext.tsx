import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type TranslationStudioBridgeCtx = {
  queuedTranslationText: string
  hasPendingTranslation: boolean
  exportTranslationToStudio: (text: string, options?: { navigate?: boolean }) => void
  consumePendingTranslationForBrief: () => string | null
  clearPendingTranslationForStudio: () => void

  queuedNewsBriefText: string
  hasPendingNewsBrief: boolean
  exportNewsToStudio: (text: string, options?: { navigate?: boolean }) => void
  consumePendingNewsForBrief: () => string | null
  clearPendingNewsForStudio: () => void

  queuedNewsTranslateText: string
  hasPendingNewsTranslate: boolean
  exportNewsToTranslate: (text: string, options?: { navigate?: boolean }) => void
  consumePendingNewsForTranslate: () => string | null
  clearPendingNewsForTranslate: () => void
}

const Ctx = createContext<TranslationStudioBridgeCtx | null>(null)

export function TranslationStudioBridgeProvider({
  children,
  goToStudio,
  goToTranslate,
}: {
  children: ReactNode
  goToStudio: () => void
  goToTranslate: () => void
}) {
  const [pendingTr, setPendingTr] = useState('')
  const [pendingNewsBrief, setPendingNewsBrief] = useState('')
  const [pendingNewsTranslate, setPendingNewsTranslate] = useState('')

  const exportTranslationToStudio = useCallback(
    (text: string, options?: { navigate?: boolean }) => {
      setPendingTr(text)
      if (options?.navigate !== false) goToStudio()
    },
    [goToStudio],
  )

  const consumePendingTranslationForBrief = useCallback((): string | null => {
    const box: { v: string | null } = { v: null }
    setPendingTr((cur) => {
      const t = cur.trim()
      if (!t) return cur
      box.v = cur
      return ''
    })
    const out = box.v
    return out != null && out.trim() !== '' ? out : null
  }, [])

  const clearPendingTranslationForStudio = useCallback(() => {
    setPendingTr('')
  }, [])

  const exportNewsToStudio = useCallback(
    (text: string, options?: { navigate?: boolean }) => {
      setPendingNewsBrief(text)
      if (options?.navigate !== false) goToStudio()
    },
    [goToStudio],
  )

  const consumePendingNewsForBrief = useCallback((): string | null => {
    const box: { v: string | null } = { v: null }
    setPendingNewsBrief((cur) => {
      const t = cur.trim()
      if (!t) return cur
      box.v = cur
      return ''
    })
    const out = box.v
    return out != null && out.trim() !== '' ? out : null
  }, [])

  const clearPendingNewsForStudio = useCallback(() => {
    setPendingNewsBrief('')
  }, [])

  const exportNewsToTranslate = useCallback(
    (text: string, options?: { navigate?: boolean }) => {
      setPendingNewsTranslate(text)
      if (options?.navigate !== false) goToTranslate()
    },
    [goToTranslate],
  )

  const consumePendingNewsForTranslate = useCallback((): string | null => {
    const box: { v: string | null } = { v: null }
    setPendingNewsTranslate((cur) => {
      const t = cur.trim()
      if (!t) return cur
      box.v = cur
      return ''
    })
    const out = box.v
    return out != null && out.trim() !== '' ? out : null
  }, [])

  const clearPendingNewsForTranslate = useCallback(() => {
    setPendingNewsTranslate('')
  }, [])

  const value = useMemo(
    (): TranslationStudioBridgeCtx => ({
      queuedTranslationText: pendingTr,
      hasPendingTranslation: pendingTr.trim().length > 0,
      exportTranslationToStudio,
      consumePendingTranslationForBrief,
      clearPendingTranslationForStudio,

      queuedNewsBriefText: pendingNewsBrief,
      hasPendingNewsBrief: pendingNewsBrief.trim().length > 0,
      exportNewsToStudio,
      consumePendingNewsForBrief,
      clearPendingNewsForStudio,

      queuedNewsTranslateText: pendingNewsTranslate,
      hasPendingNewsTranslate: pendingNewsTranslate.trim().length > 0,
      exportNewsToTranslate,
      consumePendingNewsForTranslate,
      clearPendingNewsForTranslate,
    }),
    [
      pendingTr,
      pendingNewsBrief,
      pendingNewsTranslate,
      exportTranslationToStudio,
      consumePendingTranslationForBrief,
      clearPendingTranslationForStudio,
      exportNewsToStudio,
      consumePendingNewsForBrief,
      clearPendingNewsForStudio,
      exportNewsToTranslate,
      consumePendingNewsForTranslate,
      clearPendingNewsForTranslate,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTranslationStudioBridge(): TranslationStudioBridgeCtx {
  const v = useContext(Ctx)
  if (!v) {
    throw new Error('useTranslationStudioBridge must be used within TranslationStudioBridgeProvider')
  }
  return v
}
