import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type TranslationStudioBridgeCtx = {
  /** Raw text queued for Studio (may be empty). */
  queuedTranslationText: string
  /** Non-empty when Translate exported text for Studio (not yet consumed). */
  hasPendingTranslation: boolean
  /** Queue Brazilian Portuguese (or any) translation text for the Studio brief. */
  exportTranslationToStudio: (text: string, options?: { navigate?: boolean }) => void
  /** Read and clear pending text for use as the Studio brief. Returns null if empty. */
  consumePendingTranslationForBrief: () => string | null
  /** Discard queued text without using it. */
  clearPendingTranslationForStudio: () => void
}

const Ctx = createContext<TranslationStudioBridgeCtx | null>(null)

export function TranslationStudioBridgeProvider({
  children,
  goToStudio,
}: {
  children: ReactNode
  goToStudio: () => void
}) {
  const [pending, setPending] = useState('')

  const exportTranslationToStudio = useCallback(
    (text: string, options?: { navigate?: boolean }) => {
      setPending(text)
      if (options?.navigate !== false) {
        goToStudio()
      }
    },
    [goToStudio],
  )

  const consumePendingTranslationForBrief = useCallback((): string | null => {
    const box: { v: string | null } = { v: null }
    setPending((cur) => {
      const t = cur.trim()
      if (!t) return cur
      box.v = cur
      return ''
    })
    const out = box.v
    return out != null && out.trim() !== '' ? out : null
  }, [])

  const clearPendingTranslationForStudio = useCallback(() => {
    setPending('')
  }, [])

  const value = useMemo(
    (): TranslationStudioBridgeCtx => ({
      queuedTranslationText: pending,
      hasPendingTranslation: pending.trim().length > 0,
      exportTranslationToStudio,
      consumePendingTranslationForBrief,
      clearPendingTranslationForStudio,
    }),
    [
      pending,
      exportTranslationToStudio,
      consumePendingTranslationForBrief,
      clearPendingTranslationForStudio,
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
