const STORAGE_KEY = 'gigi_llm_prefs'

export type TextProviderId = 'ollama' | 'openai' | 'anthropic' | 'gemini'

export type LlmUserPrefs = {
  textProvider: TextProviderId
  /** Model id / Ollama tag; empty = server default for that provider */
  textModel: string
  /** Ollama image model tag; empty = server default */
  imageModel: string
}

export const defaultLlmPrefs: LlmUserPrefs = {
  textProvider: 'ollama',
  textModel: '',
  imageModel: '',
}

export function loadLlmPrefs(): LlmUserPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...defaultLlmPrefs }
    const o = JSON.parse(raw) as Partial<LlmUserPrefs>
    const textProvider = o.textProvider
    if (textProvider !== 'ollama' && textProvider !== 'openai' && textProvider !== 'anthropic' && textProvider !== 'gemini') {
      return { ...defaultLlmPrefs }
    }
    return {
      textProvider,
      textModel: typeof o.textModel === 'string' ? o.textModel : '',
      imageModel: typeof o.imageModel === 'string' ? o.imageModel : '',
    }
  } catch {
    return { ...defaultLlmPrefs }
  }
}

export function saveLlmPrefs(p: LlmUserPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

/** Fields to merge into JSON bodies for text LLM routes. */
export function textLlmJsonFields(prefs: LlmUserPrefs): { text_provider: TextProviderId; text_model?: string } {
  const text_model = prefs.textModel.trim() || undefined
  return {
    text_provider: prefs.textProvider,
    ...(text_model ? { text_model } : {}),
  }
}

/** Optional Ollama image model override for POST /api/studio/generate-image */
export function imageModelJsonField(prefs: LlmUserPrefs): { model?: string } {
  const m = prefs.imageModel.trim()
  return m ? { model: m } : {}
}
