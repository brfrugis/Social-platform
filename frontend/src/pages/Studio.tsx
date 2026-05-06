import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslationStudioBridge } from '../context/TranslationStudioBridgeContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useLlmSettings } from '../context/LlmSettingsContext'
import { api, principalHeaders } from '../lib/api'
import { imageModelJsonField, textLlmJsonFields } from '../lib/llmSettingsStorage'
import {
  appendStudioHistoryRun,
  clearStudioHistory,
  loadStudioHistory,
  removeStudioHistoryRun,
  type StudioHistoryRun,
} from '../lib/studioHistoryStorage'
import { composerUrlForPlatform, PLATFORM_LABEL } from '../lib/studioPublish'
import { tenantApi } from '../lib/tenantApi'

type Format = { id: string; name: string; description: string; sample?: string }
type Tone = { id: string; name: string; instructions: string; sample?: string }
type Presets = {
  formats: Format[]
  tones: Tone[]
  article_formats?: Format[]
  article_tones?: Tone[]
}

type StudioMode = 'social' | 'article'
type GuardTemplate = {
  id: string
  name: string
  description?: string
  guardrails?: string
  skeleton?: string
  sample?: string
}

type GenResult = {
  format_id: string
  tone_id: string
  format_name: string
  tone_name: string
  content: string
  template_ids?: string[]
  template_names?: string[]
  usage?: TokenUsage
}

type PublishConnection = {
  id: string
  platform: string
  display_label: string | null
  status: string
  has_access_token: boolean
}

const OUTPUT_LANGS = ['Portuguese (Brazil)', 'English', 'Spanish'] as const

type TokenUsage = {
  prompt_eval_count: number | null
  eval_count: number | null
}

function fmtCount(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString()
}

function fmtTotal(u: TokenUsage): string {
  if (u.prompt_eval_count == null && u.eval_count == null) return '—'
  const a = u.prompt_eval_count ?? 0
  const b = u.eval_count ?? 0
  if (u.prompt_eval_count == null || u.eval_count == null) {
    return (a + b).toLocaleString() + ' (partial)'
  }
  return (a + b).toLocaleString()
}

type VariantImageState = {
  promptDraft: string
  imageDataUrl: string | null
  loadingPrompt: boolean
  loadingImage: boolean
  error: string | null
  /** Tokens from last POST /api/studio/image-prompt (text model). */
  lastPromptUsage: TokenUsage | null
  lastPromptNotes: string
  /** Tokens from last POST /api/studio/generate-image (image model). */
  lastImageUsage: TokenUsage | null
  lastImageNotes: string
}

function emptyVariantImage(): VariantImageState {
  return {
    promptDraft: '',
    imageDataUrl: null,
    loadingPrompt: false,
    loadingImage: false,
    error: null,
    lastPromptUsage: null,
    lastPromptNotes: '',
    lastImageUsage: null,
    lastImageNotes: '',
  }
}

function usageLine(u: TokenUsage | null): string {
  if (!u) return '—'
  return `in ${fmtCount(u.prompt_eval_count)} · out ${fmtCount(u.eval_count)}`
}

const IMAGE_STYLE_CHIPS: { label: string; suffix: string }[] = [
  { label: 'Photorealistic', suffix: ', photorealistic, natural lighting, sharp detail' },
  { label: 'Cartoon', suffix: ', cartoon style, bold outlines, vibrant flat colors' },
  { label: 'Minimal vector', suffix: ', flat vector illustration, minimal, clean composition' },
  { label: 'Cinematic', suffix: ', cinematic lighting, moody atmosphere, film still' },
]

function appendImageStyleSuffix(draft: string, suffix: string): string {
  const core = suffix.trim().replace(/^,\s*/, '')
  const t = draft.trim()
  if (!t) return core
  const probe = core.slice(0, 24).toLowerCase()
  if (t.toLowerCase().includes(probe)) return t
  return `${t}${suffix.startsWith(',') ? suffix : `, ${suffix}`}`
}

function VariantImagePanel({
  formatName,
  toneName,
  ollamaImageModel,
  contentKind,
  slice,
  onPatch,
  onSuggest,
  onGenerate,
}: {
  formatName: string
  toneName: string
  ollamaImageModel: string
  contentKind: StudioMode
  slice: VariantImageState | undefined
  onPatch: (patch: Partial<VariantImageState>) => void
  onSuggest: () => void
  onGenerate: (prompt: string) => void
}) {
  const v = { ...emptyVariantImage(), ...slice }
  const imageHead =
    contentKind === 'article' ? 'Hero image for this article' : 'Image for this post'
  return (
    <div className="variant-image-panel">
      <div className="variant-image-head">
        <span className="publish-bar-label">{imageHead}</span>
        <span className="muted small">Ollama model: {ollamaImageModel || '—'}</span>
      </div>
      <p className="hint small" style={{ marginTop: 0 }}>
        Suggest an English image prompt from the{' '}
        {contentKind === 'article' ? 'article excerpt or key paragraph' : 'caption'}, edit it freely, then generate a PNG.
        Use the style shortcuts to nudge toward realistic, cartoon, or other looks. Publishing copies the text and
        downloads the image (attach it in the network composer).
      </p>
      <div className="row tight">
        <button
          type="button"
          className="btn secondary small"
          disabled={v.loadingPrompt || v.loadingImage}
          onClick={() => onSuggest()}
        >
          {v.loadingPrompt ? 'Suggesting…' : 'Suggest image prompt'}
        </button>
        <button
          type="button"
          className="btn secondary small"
          disabled={v.loadingImage}
          onClick={() =>
            onPatch({
              promptDraft: '',
              imageDataUrl: null,
              error: null,
              lastPromptUsage: null,
              lastPromptNotes: '',
              lastImageUsage: null,
              lastImageNotes: '',
            })
          }
        >
          Reset image
        </button>
      </div>
      <label className="field" style={{ marginTop: '0.5rem' }}>
        <span>Image prompt (for {formatName} · {toneName})</span>
        <textarea
          className="input"
          rows={4}
          value={v.promptDraft}
          placeholder="Click Suggest image prompt or write your own diffusion prompt in English."
          onChange={(e) => onPatch({ promptDraft: e.target.value })}
        />
      </label>
      <div className="row tight" style={{ flexWrap: 'wrap', gap: '0.35rem' }}>
        <span className="muted small" style={{ width: '100%' }}>
          Style shortcuts (append to prompt):
        </span>
        {IMAGE_STYLE_CHIPS.map((ch) => (
          <button
            key={ch.label}
            type="button"
            className="btn secondary small"
            disabled={v.loadingImage || v.loadingPrompt}
            onClick={() => onPatch({ promptDraft: appendImageStyleSuffix(v.promptDraft, ch.suffix) })}
          >
            {ch.label}
          </button>
        ))}
      </div>
      <div className="row tight">
        <button
          type="button"
          className="btn primary small"
          disabled={!v.promptDraft.trim() || v.loadingImage || v.loadingPrompt}
          onClick={() => onGenerate(v.promptDraft)}
        >
          {v.loadingImage ? 'Generating image…' : 'Generate image'}
        </button>
      </div>
      {v.error ? (
        <div className="banner error" role="alert" style={{ marginTop: '0.5rem' }}>
          {v.error}
        </div>
      ) : null}
      {(v.lastPromptUsage || v.lastPromptNotes) && (
        <div className="variant-image-usage muted small" role="status">
          <strong>Image prompt call</strong> — tokens: {usageLine(v.lastPromptUsage)}
          {v.lastPromptNotes ? <span className="usage-inline-note"> · {v.lastPromptNotes}</span> : null}
        </div>
      )}
      {(v.lastImageUsage || v.lastImageNotes) && (
        <div className="variant-image-usage muted small" role="status">
          <strong>Image generate</strong> — tokens: {usageLine(v.lastImageUsage)}
          {v.lastImageNotes ? <span className="usage-inline-note"> · {v.lastImageNotes}</span> : null}
        </div>
      )}
      {v.imageDataUrl ? (
        <figure className="variant-image-figure">
          <img src={v.imageDataUrl} alt="Generated image from prompt" className="variant-image-preview" />
          <figcaption className="muted small">
            <a href={v.imageDataUrl} download={`gigi-image-${formatName.replace(/\s+/g, '-')}.png`}>
              Download PNG
            </a>
          </figcaption>
        </figure>
      ) : null}
    </div>
  )
}

function PublishBar({
  connections,
  caption,
  imageDataUrl,
  tenantsOk,
  activeCustomerId,
  showFootnote,
  onPublish,
}: {
  connections: PublishConnection[]
  caption: string
  imageDataUrl: string | null
  tenantsOk: boolean | null
  activeCustomerId: string | null
  showFootnote: boolean
  onPublish: (platform: string, caption: string, imageDataUrl: string | null) => void | Promise<void>
}) {
  return (
    <div className="publish-bar" role="group" aria-label="Publish to connected platforms">
      <span className="publish-bar-label">Publish</span>
      {connections.length === 0 ? (
        <span className="muted small">
          {tenantsOk === true && activeCustomerId
            ? 'No integrations for this workspace — add connections under Integrations.'
            : tenantsOk === false
              ? 'Tenant API offline — open Integrations after the database is available.'
              : 'Open Integrations (with workspace and DB) to link LinkedIn, X, Instagram, or Facebook.'}
        </span>
      ) : (
        <div className="publish-actions">
          {connections.map((c) => {
            const labelBase = PLATFORM_LABEL[c.platform] ?? c.platform
            const label = c.display_label ? `${labelBase} · ${c.display_label}` : labelBase
            const ready = c.status === 'active' && c.has_access_token
            return (
              <button
                key={c.id}
                type="button"
                className={`btn small ${ready ? 'primary' : 'secondary'}`}
                title={
                  imageDataUrl
                    ? 'Copy caption, download PNG, open composer — attach the file where the network allows images'
                    : ready
                      ? 'Copy caption and open the platform composer in a new tab'
                      : 'Copy caption and open composer — set connection to active with a token in Integrations for API publish later'
                }
                onClick={() => void onPublish(c.platform, caption, imageDataUrl)}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}
      {showFootnote && connections.length > 0 ? (
        <p className="publish-hint muted small">
          One-click API posting is not enabled yet. This copies the caption, opens the composer
          {imageDataUrl ? ', and downloads the generated image so you can attach it with the post' : ''}.
        </p>
      ) : null}
    </div>
  )
}

export default function Studio() {
  const { principalId, tenantsOk, activeCustomerId, customers } = useWorkspace()
  const { prefs: llmPrefs } = useLlmSettings()
  const {
    queuedTranslationText,
    hasPendingTranslation,
    consumePendingTranslationForBrief,
    clearPendingTranslationForStudio,
    queuedNewsBriefText,
    hasPendingNewsBrief,
    consumePendingNewsForBrief,
    clearPendingNewsForStudio,
  } = useTranslationStudioBridge()
  const activeWorkspaceName =
    tenantsOk === true && activeCustomerId
      ? customers.find((c) => c.id === activeCustomerId)?.name
      : null

  const [importNotice, setImportNotice] = useState<string | null>(null)

  const [presets, setPresets] = useState<Presets>({
    formats: [],
    tones: [],
    article_formats: [],
    article_tones: [],
  })
  const [studioMode, setStudioMode] = useState<StudioMode>('social')
  const [templates, setTemplates] = useState<GuardTemplate[]>([])
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Record<string, boolean>>({})
  const [brief, setBrief] = useState('')
  const [outputLanguage, setOutputLanguage] = useState<string>(OUTPUT_LANGS[0])
  const [temperature, setTemperature] = useState(0.7)
  const [selectedPairs, setSelectedPairs] = useState<Record<string, boolean>>({})
  const [generating, setGenerating] = useState(false)
  const [results, setResults] = useState<GenResult[]>([])
  const [usageSummary, setUsageSummary] = useState<{
    session_totals: TokenUsage
    usage_notes: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [historyRuns, setHistoryRuns] = useState<StudioHistoryRun[]>([])
  const [publishConnections, setPublishConnections] = useState<PublishConnection[]>([])
  const [ollamaImageModel, setOllamaImageModel] = useState('')
  const [variantImages, setVariantImages] = useState<Record<number, VariantImageState>>({})
  /** Sum of Ollama-reported tokens for image-prompt + image-generate calls since last main Generate. */
  const [imageToolsSession, setImageToolsSession] = useState({
    prompt: 0,
    completion: 0,
    hasPartial: false,
  })

  const variantCount = useMemo(
    () => Object.values(selectedPairs).filter(Boolean).length,
    [selectedPairs],
  )

  const matrixFormats = studioMode === 'article' ? presets.article_formats ?? [] : presets.formats
  const matrixTones = studioMode === 'article' ? presets.article_tones ?? [] : presets.tones

  useEffect(() => {
    setSelectedPairs({})
  }, [studioMode])

  const load = useCallback(async () => {
    const [p, t] = await Promise.all([
      api<Presets>('/api/presets'),
      api<{ templates: GuardTemplate[] }>('/api/templates'),
    ])
    setPresets(p)
    setTemplates(t.templates || [])
    try {
      const h = await api<{ ollama_image_model?: string }>('/api/health')
      setOllamaImageModel(typeof h?.ollama_image_model === 'string' ? h.ollama_image_model : '')
    } catch {
      setOllamaImageModel('')
    }
    setError(null)
  }, [])

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [load])

  useEffect(() => {
    setHistoryRuns(loadStudioHistory(activeCustomerId))
  }, [activeCustomerId])

  const loadPublishConnections = useCallback(async () => {
    if (!activeCustomerId || tenantsOk !== true) {
      setPublishConnections([])
      return
    }
    try {
      const list = await tenantApi<PublishConnection[]>(
        principalId,
        `/api/tenants/customers/${activeCustomerId}/connections`,
      )
      setPublishConnections(
        Array.isArray(list)
          ? list.map((r) => ({
              id: r.id,
              platform: r.platform,
              display_label: r.display_label ?? null,
              status: r.status,
              has_access_token: !!r.has_access_token,
            }))
          : [],
      )
    } catch {
      setPublishConnections([])
    }
  }, [principalId, activeCustomerId, tenantsOk])

  useEffect(() => {
    void loadPublishConnections()
  }, [loadPublishConnections])

  useEffect(() => {
    if (!importNotice) return
    const id = window.setTimeout(() => setImportNotice(null), 8000)
    return () => window.clearTimeout(id)
  }, [importNotice])

  const bringFromTranslation = useCallback(() => {
    if (!hasPendingTranslation) {
      setError(
        'No translation queued. On the Translate tab, run a translation to pt-BR, then click Export to Studio.',
      )
      return
    }
    const queued = queuedTranslationText.trim()
    if (!queued) {
      setError('Nothing to import. Try exporting again from Translate.')
      return
    }
    if (brief.trim()) {
      if (
        !window.confirm(
          `Replace the current brief (${brief.length} characters) with the queued translation (${queued.length} characters)?`,
        )
      ) {
        return
      }
    }
    const applied = consumePendingTranslationForBrief()
    if (!applied?.trim()) {
      setError('Queued text was cleared. Try exporting again from Translate.')
      return
    }
    setBrief(applied)
    setOutputLanguage('Portuguese (Brazil)')
    setError(null)
    setImportNotice('Brief filled from Translate (Brazilian Portuguese).')
  }, [
    hasPendingTranslation,
    queuedTranslationText,
    consumePendingTranslationForBrief,
    brief,
  ])

  const bringFromNews = useCallback(() => {
    if (!hasPendingNewsBrief) {
      setError(
        'No news text queued. On the News tab, use Send to Studio brief on a stored item.',
      )
      return
    }
    const queued = queuedNewsBriefText.trim()
    if (!queued) {
      setError('Nothing to import. Try sending again from News.')
      return
    }
    if (brief.trim()) {
      if (
        !window.confirm(
          `Replace the current brief (${brief.length} characters) with the queued news brief (${queued.length} characters)?`,
        )
      ) {
        return
      }
    }
    const applied = consumePendingNewsForBrief()
    if (!applied?.trim()) {
      setError('Queued text was cleared. Try sending again from News.')
      return
    }
    setBrief(applied)
    setError(null)
    setImportNotice('Brief filled from News.')
  }, [hasPendingNewsBrief, queuedNewsBriefText, consumePendingNewsForBrief, brief])

  const patchVariantImage = useCallback((index: number, patch: Partial<VariantImageState>) => {
    setVariantImages((m) => ({
      ...m,
      [index]: { ...emptyVariantImage(), ...m[index], ...patch },
    }))
  }, [])

  const bumpImageToolsSession = useCallback((u: TokenUsage | undefined | null) => {
    if (!u) return
    const p = u.prompt_eval_count
    const c = u.eval_count
    setImageToolsSession((s) => ({
      prompt: s.prompt + (p ?? 0),
      completion: s.completion + (c ?? 0),
      hasPartial: s.hasPartial || p == null || c == null,
    }))
  }, [])

  const suggestImagePrompt = useCallback(
    async (index: number) => {
      const r = results[index]
      if (!r) return
      patchVariantImage(index, { loadingPrompt: true, error: null })
      try {
        const res = await api<{
          image_prompt: string
          usage?: TokenUsage
          usage_notes?: string
        }>('/api/studio/image-prompt', {
          method: 'POST',
          headers: principalHeaders(principalId),
          body: JSON.stringify({
            social_text: r.content,
            format_name: r.format_name,
            tone_name: r.tone_name,
            output_language: outputLanguage,
            temperature: 0.6,
            ...textLlmJsonFields(llmPrefs),
            ...(tenantsOk === true && activeCustomerId ? { customer_id: activeCustomerId } : {}),
          }),
        })
        const u = res.usage ?? { prompt_eval_count: null, eval_count: null }
        bumpImageToolsSession(u)
        patchVariantImage(index, {
          promptDraft: res.image_prompt,
          loadingPrompt: false,
          imageDataUrl: null,
          lastPromptUsage: u,
          lastPromptNotes: res.usage_notes ?? '',
        })
      } catch (e) {
        patchVariantImage(index, {
          loadingPrompt: false,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    },
    [
      results,
      outputLanguage,
      patchVariantImage,
      principalId,
      tenantsOk,
      activeCustomerId,
      bumpImageToolsSession,
      llmPrefs,
    ],
  )

  const generateVariantImage = useCallback(
    async (index: number, prompt: string) => {
      const p = prompt.trim()
      if (!p) return
      patchVariantImage(index, { loadingImage: true, error: null })
      try {
        const res = await api<{
          image_base64: string
          mime_type?: string
          usage?: TokenUsage
          usage_notes?: string
        }>('/api/studio/generate-image', {
          method: 'POST',
          headers: principalHeaders(principalId),
          body: JSON.stringify({
            prompt: p,
            ...imageModelJsonField(llmPrefs),
            ...(tenantsOk === true && activeCustomerId ? { customer_id: activeCustomerId } : {}),
          }),
        })
        const mime = res.mime_type?.trim() || 'image/png'
        const u = res.usage ?? { prompt_eval_count: null, eval_count: null }
        bumpImageToolsSession(u)
        patchVariantImage(index, {
          imageDataUrl: `data:${mime};base64,${res.image_base64}`,
          loadingImage: false,
          lastImageUsage: u,
          lastImageNotes: res.usage_notes ?? '',
        })
      } catch (e) {
        patchVariantImage(index, {
          loadingImage: false,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    },
    [patchVariantImage, principalId, tenantsOk, activeCustomerId, bumpImageToolsSession, llmPrefs],
  )

  const toggleTemplate = (id: string) => {
    setSelectedTemplateIds((s) => ({ ...s, [id]: !s[id] }))
  }

  const togglePair = (fid: string, tid: string) => {
    const k = `${fid}::${tid}`
    setSelectedPairs((s) => ({ ...s, [k]: !s[k] }))
  }

  const selectAllPairs = () => {
    const next: Record<string, boolean> = {}
    for (const f of matrixFormats) {
      for (const t of matrixTones) {
        next[`${f.id}::${t.id}`] = true
      }
    }
    setSelectedPairs(next)
  }

  const clearPairs = () => setSelectedPairs({})

  const runGenerate = async () => {
    const items = Object.entries(selectedPairs)
      .filter(([, v]) => v)
      .map(([k]) => {
        const [format_id, tone_id] = k.split('::')
        return { format_id, tone_id }
      })
    const template_ids = Object.entries(selectedTemplateIds)
      .filter(([, v]) => v)
      .map(([id]) => id)
    if (!brief.trim() || items.length === 0) {
      setError('Add a brief and select at least one format and tone combination.')
      return
    }
    setGenerating(true)
    setError(null)
    setResults([])
    setUsageSummary(null)
    setVariantImages({})
    setImageToolsSession({ prompt: 0, completion: 0, hasPartial: false })
    try {
      const res = await api<{
        results: GenResult[]
        session_totals: TokenUsage
        usage_notes?: string
      }>('/api/generate', {
        method: 'POST',
        headers: principalHeaders(principalId),
        body: JSON.stringify({
          brief,
          items,
          template_ids,
          output_language: outputLanguage,
          temperature,
          ...textLlmJsonFields(llmPrefs),
          ...(tenantsOk === true && activeCustomerId ? { customer_id: activeCustomerId } : {}),
          studio_mode: studioMode,
        }),
      })
      setResults(res.results)
      const nextUsage = {
        session_totals: res.session_totals,
        usage_notes: res.usage_notes ?? '',
      }
      setUsageSummary(nextUsage)
      appendStudioHistoryRun(activeCustomerId, {
        brief,
        outputLanguage,
        temperature,
        results: res.results,
        usageSummary: nextUsage,
        studioMode,
      })
      setHistoryRuns(loadStudioHistory(activeCustomerId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  const selectedTplCount = Object.values(selectedTemplateIds).filter(Boolean).length

  const copyAndOpenComposer = useCallback(
    async (platform: string, caption: string, imageDataUrl: string | null) => {
      try {
        await navigator.clipboard.writeText(caption)
      } catch {
        /* still open composer */
      }
      if (imageDataUrl) {
        const a = document.createElement('a')
        a.href = imageDataUrl
        a.download = `gigi-${platform}-post.png`
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        a.remove()
      }
      window.open(composerUrlForPlatform(platform), '_blank', 'noopener,noreferrer')
    },
    [],
  )

  const restoreHistoryRun = useCallback((run: StudioHistoryRun) => {
    setResults(run.results as GenResult[])
    setUsageSummary(run.usageSummary)
    setVariantImages({})
    setImageToolsSession({ prompt: 0, completion: 0, hasPartial: false })
    setStudioMode(run.studioMode ?? 'social')
    setError(null)
  }, [])

  const deleteHistoryRun = useCallback(
    (id: string) => {
      removeStudioHistoryRun(activeCustomerId, id)
      setHistoryRuns(loadStudioHistory(activeCustomerId))
    },
    [activeCustomerId],
  )

  const wipeHistory = useCallback(() => {
    if (
      historyRuns.length > 0 &&
      !window.confirm(`Remove all ${historyRuns.length} saved generation(s) for this workspace in this browser?`)
    ) {
      return
    }
    clearStudioHistory(activeCustomerId)
    setHistoryRuns([])
  }, [activeCustomerId, historyRuns.length])

  const briefPreview = (text: string, max = 96) => {
    const t = text.replace(/\s+/g, ' ').trim()
    if (t.length <= max) return t || '(empty brief)'
    return `${t.slice(0, max)}…`
  }

  return (
    <div className="page-stack">
      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}

      {activeWorkspaceName && (
        <div className="banner soft" role="status">
          Active workspace: <strong>{activeWorkspaceName}</strong>. Generation uses local presets; token usage from
          Generate and image steps is logged to <strong>Workspace → Consolidated token usage</strong>. Use{' '}
          <strong>Publish</strong> under each variant to copy text and open the composer for a linked account (full
          API publish is planned). History is saved in this browser per workspace.
        </div>
      )}

      {importNotice && (
        <div className="banner soft" role="status">
          {importNotice}
        </div>
      )}

      <ol className="workflow-rail" aria-label="Suggested workflow">
        <li className="workflow-step">
          <span className="w-num">1</span>
          Guardrails
        </li>
        <li className="workflow-step">
          <span className="w-num">2</span>
          Brief
        </li>
        <li className="workflow-step">
          <span className="w-num">3</span>
          Formats
        </li>
        <li className="workflow-step">
          <span className="w-num">4</span>
          Output
        </li>
      </ol>

      <section className="step-card">
        <div className="step-head">
          <span className="step-num">1</span>
          <div>
            <h2 className="step-title">Guardrail templates</h2>
            <p className="step-desc">
              Choose saved rules (from Templates). They apply to every variant in this
              batch. Skip this step if you do not need extra constraints.
            </p>
          </div>
          <span className="step-badge">{selectedTplCount} selected</span>
        </div>
        {templates.length === 0 ? (
          <div className="empty-out">
            <strong>No templates yet</strong>
            <span className="muted">
              Open <strong>Templates</strong> in the sidebar to add disclosures, claim
              limits, or layout skeletons, then return here to activate them.
            </span>
          </div>
        ) : (
          <div className="tpl-grid">
            {templates.map((tpl) => {
              const on = !!selectedTemplateIds[tpl.id]
              return (
                <label key={tpl.id} className={`tpl-card ${on ? 'on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleTemplate(tpl.id)}
                  />
                  <div className="tpl-card-body">
                    <span className="tpl-name">{tpl.name}</span>
                    {tpl.description && (
                      <span className="tpl-desc">{tpl.description}</span>
                    )}
                  </div>
                </label>
              )
            })}
          </div>
        )}
      </section>

      <div className="studio-grid">
        <section className="step-card">
          <div className="step-head">
            <span className="step-num">2</span>
            <div>
              <h2 className="step-title">Brief and creativity</h2>
              <p className="step-desc">
                Describe what to write, or pull in copy from <strong>Translate</strong> (pt-BR) or a headline bundle from{' '}
                <strong>News</strong>. Temperature controls randomness: lower is more predictable, higher is more varied.
                {studioMode === 'article' && (
                  <>
                    {' '}
                    <strong>Blog articles</strong> aim for SEO-ready long form (metadata block, tags, structured headings,
                    ~1,800+ words — model and hardware dependent).
                  </>
                )}
              </p>
            </div>
            <div className="step-badge" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              <button
                type="button"
                className={`btn small ${hasPendingTranslation ? 'primary' : 'secondary'}`}
                onClick={() => bringFromTranslation()}
                title="Paste queued translation from the Translate tab into the brief"
              >
                Bring from translation
              </button>
              {hasPendingTranslation && (
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => {
                    clearPendingTranslationForStudio()
                    setImportNotice(null)
                  }}
                >
                  Discard queued translation
                </button>
              )}
              <button
                type="button"
                className={`btn small ${hasPendingNewsBrief ? 'primary' : 'secondary'}`}
                onClick={() => bringFromNews()}
                title="Paste queued news reference from the News tab into the brief"
              >
                Bring from news
              </button>
              {hasPendingNewsBrief && (
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => {
                    clearPendingNewsForStudio()
                    setImportNotice(null)
                  }}
                >
                  Discard queued news
                </button>
              )}
            </div>
          </div>
          {hasPendingTranslation && (
            <p className="hint" style={{ marginTop: 0 }}>
              A translation is <strong>queued</strong> for Studio — click <strong>Bring from translation</strong> to
              use it as the brief (output language will switch to Brazilian Portuguese).
            </p>
          )}
          {hasPendingNewsBrief && (
            <p className="hint" style={{ marginTop: 0 }}>
              News content is <strong>queued</strong> for Studio — click <strong>Bring from news</strong> to paste it into
              the brief.
            </p>
          )}
          <textarea
            className="input tall"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder={
              studioMode === 'article'
                ? 'Article brief: topic, audience, keyword themes, must-cover sections, CTAs, competitors to differentiate from, …'
                : 'Example: Product launch for … Audience: … Include … Avoid …'
            }
          />
          <div className="row">
            <label className="field">
              <span>Output language</span>
              <select
                value={outputLanguage}
                onChange={(e) => setOutputLanguage(e.target.value)}
              >
                {OUTPUT_LANGS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="field range-field">
              <span>Temperature · {temperature.toFixed(2)}</span>
              <div className="range-row">
                <span>Precise</span>
                <input
                  type="range"
                  className="temp-slider"
                  min={0}
                  max={2}
                  step={0.05}
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                  aria-valuemin={0}
                  aria-valuemax={2}
                  aria-valuenow={temperature}
                  aria-label="Temperature"
                />
                <span>Creative</span>
              </div>
            </label>
            <label className="field">
              <span>Fine tune</span>
              <input
                type="number"
                className="input input-compact"
                min={0}
                max={2}
                step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
              />
            </label>
          </div>
          <div className="row actions">
            <button
              type="button"
              className="btn primary"
              disabled={generating}
              onClick={() => void runGenerate()}
            >
              {generating ? 'Working…' : 'Generate'}
            </button>
            <span className="step-badge">{variantCount} variant(s)</span>
            <button type="button" className="btn secondary" onClick={() => void load()}>
              Reload presets
            </button>
          </div>
          <p className="hint">
            Each checked format and tone pair runs one model call.
            {studioMode === 'article'
              ? ' Articles request a large completion budget — runs can take noticeably longer on CPU or smaller models.'
              : ' Many variants can take noticeable time on CPU.'}
          </p>
        </section>

        <section className="step-card">
          <div className="step-head">
            <span className="step-num">3</span>
            <div>
              <h2 className="step-title">Formats and tones</h2>
              <p className="step-desc">
                {studioMode === 'social'
                  ? 'Social presets: mix channels and voices. Hover a format name for its full description.'
                  : 'Blog presets: article structures and long-form tones (SEO-oriented generation). Hover for details.'}
              </p>
            </div>
            <div className="row tight">
              <button type="button" className="btn secondary small" onClick={selectAllPairs}>
                Select all
              </button>
              <button type="button" className="btn secondary small" onClick={clearPairs}>
                Clear
              </button>
            </div>
          </div>
          <div className="studio-mode-toggle" role="group" aria-label="Studio output type">
            <button
              type="button"
              className={`btn small ${studioMode === 'social' ? 'primary' : 'secondary'}`}
              onClick={() => setStudioMode('social')}
            >
              Social posts
            </button>
            <button
              type="button"
              className={`btn small ${studioMode === 'article' ? 'primary' : 'secondary'}`}
              onClick={() => setStudioMode('article')}
            >
              Blog articles
            </button>
          </div>
          <div className="matrix scroll-matrix">
            {matrixFormats.length === 0 || matrixTones.length === 0 ? (
              <div className="empty-out">
                <strong>Nothing to pick yet</strong>
                <span className="muted">
                  {studioMode === 'article'
                    ? 'Add article_formats and article_tones in Library (presets JSON), or restore defaults from the repo data/presets.json.'
                    : 'Add formats and tones under Library (presets JSON).'}
                </span>
              </div>
            ) : (
              matrixFormats.map((f) => (
                <div key={f.id} className="matrix-row">
                  <div className="matrix-format" title={f.description}>
                    {f.name}
                  </div>
                  <div className="matrix-cells">
                    {matrixTones.map((t) => {
                      const k = `${f.id}::${t.id}`
                      const on = !!selectedPairs[k]
                      return (
                        <label key={k} className={`chip ${on ? 'on' : ''}`} title={t.name}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => togglePair(f.id, t.id)}
                          />
                          {t.name}
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="step-card step-card-wide">
        <div className="step-head">
          <span className="step-num">4</span>
          <div>
            <h2 className="step-title">Output</h2>
            <p className="step-desc">
              {studioMode === 'article'
                ? 'Review each article variant (SEO metadata block plus long body). Optional hero image from a suggested prompt. Publish copies text for your CMS or composer.'
                : 'Review each block, add an optional image (suggested prompt → generate), then publish caption plus downloaded image via your linked integrations.'}{' '}
              Past runs stay in <strong>Generation history</strong> below.
            </p>
          </div>
        </div>
        {results.length === 0 ? (
          <div className="empty-out">
            <strong>Ready when you are</strong>
            <span className="muted">
              After you click <strong>Generate</strong>, every variant appears here with its
              format, tone, and guardrail labels.
            </span>
          </div>
        ) : (
          <>
            {usageSummary && (
              <div className="usage-panel" role="status">
                <div className="usage-panel-title">Token usage (this run)</div>
                <div className="usage-grid">
                  <div className="usage-metric">
                    <span className="usage-label">Prompt tokens</span>
                    <span className="usage-value">
                      {fmtCount(usageSummary.session_totals.prompt_eval_count)}
                    </span>
                  </div>
                  <div className="usage-metric">
                    <span className="usage-label">Completion tokens</span>
                    <span className="usage-value">
                      {fmtCount(usageSummary.session_totals.eval_count)}
                    </span>
                  </div>
                  <div className="usage-metric">
                    <span className="usage-label">Total (reported)</span>
                    <span className="usage-value">
                      {fmtTotal(usageSummary.session_totals)}
                    </span>
                  </div>
                </div>
                {usageSummary.usage_notes ? (
                  <p className="usage-note">{usageSummary.usage_notes}</p>
                ) : null}
                <p className="usage-hint muted small">
                  Counts come from Ollama (<code>prompt_eval_count</code>, <code>eval_count</code>).
                  They can be missing when the prompt is cached. For raw JSON, call the API from
                  your terminal or use <code>/docs</code>.
                </p>
              </div>
            )}
            {(imageToolsSession.prompt > 0 ||
              imageToolsSession.completion > 0 ||
              imageToolsSession.hasPartial) && (
              <div className="usage-panel usage-panel-compact" role="status">
                <div className="usage-panel-title">Token usage (image tools, this batch)</div>
                <div className="usage-grid">
                  <div className="usage-metric">
                    <span className="usage-label">Prompt (sum)</span>
                    <span className="usage-value">{fmtCount(imageToolsSession.prompt)}</span>
                  </div>
                  <div className="usage-metric">
                    <span className="usage-label">Completion (sum)</span>
                    <span className="usage-value">{fmtCount(imageToolsSession.completion)}</span>
                  </div>
                  <div className="usage-metric">
                    <span className="usage-label">Total (sum)</span>
                    <span className="usage-value">
                      {(imageToolsSession.prompt + imageToolsSession.completion).toLocaleString()}
                    </span>
                  </div>
                </div>
                <p className="usage-hint muted small" style={{ marginBottom: 0 }}>
                  Includes every <strong>Suggest image prompt</strong> (text model) and <strong>Generate image</strong>{' '}
                  (<code>/api/generate</code>) since the last main <strong>Generate</strong>. Some image builds omit
                  counts — per-variant lines still show notes when Ollama returns them.
                </p>
              </div>
            )}
            <ul className="results">
              {results.map((r, i) => (
                <li key={`${r.format_id}-${r.tone_id}-${i}`} className="result-block">
                  <div className="result-head">
                    <strong>{r.format_name}</strong>
                    <span className="sep">·</span>
                    <span>{r.tone_name}</span>
                    {r.usage && (
                      <>
                        <span className="sep">·</span>
                        <span className="usage-chip" title="Ollama-reported tokens for this call">
                          in {fmtCount(r.usage.prompt_eval_count)} · out{' '}
                          {fmtCount(r.usage.eval_count)}
                        </span>
                      </>
                    )}
                    {r.template_names && r.template_names.length > 0 && (
                      <>
                        <span className="sep">·</span>
                        <span className="tpl-inline">
                          Guardrails: {r.template_names.join(', ')}
                        </span>
                      </>
                    )}
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => void navigator.clipboard.writeText(r.content)}
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="result-body">{r.content}</pre>
                  <VariantImagePanel
                    formatName={r.format_name}
                    toneName={r.tone_name}
                    ollamaImageModel={ollamaImageModel}
                    contentKind={studioMode}
                    slice={variantImages[i]}
                    onPatch={(patch) => patchVariantImage(i, patch)}
                    onSuggest={() => void suggestImagePrompt(i)}
                    onGenerate={(prompt) => void generateVariantImage(i, prompt)}
                  />
                  <PublishBar
                    connections={publishConnections}
                    caption={r.content}
                    imageDataUrl={variantImages[i]?.imageDataUrl ?? null}
                    tenantsOk={tenantsOk}
                    activeCustomerId={activeCustomerId}
                    showFootnote
                    onPublish={copyAndOpenComposer}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="step-card step-card-wide studio-history-section">
        <div className="step-head">
          <div>
            <h2 className="step-title">Generation history</h2>
            <p className="step-desc">
              Each successful <strong>Generate</strong> is saved here (this device, scoped to the active workspace
              customer when one is selected).
            </p>
          </div>
          {historyRuns.length > 0 ? (
            <button type="button" className="btn secondary small" onClick={() => wipeHistory()}>
              Clear all
            </button>
          ) : null}
        </div>
        {historyRuns.length === 0 ? (
          <div className="empty-out empty-out-tight">
            <strong>No saved runs yet</strong>
            <span className="muted">Generate once — the batch will appear here automatically.</span>
          </div>
        ) : (
          <ul className="history-run-list">
            {historyRuns.map((run) => (
              <li key={run.id} className="history-run">
                <details>
                  <summary className="history-run-summary">
                    <span className="history-run-meta">
                      {new Date(run.createdAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                      <span className="sep">·</span>
                      {run.studioMode === 'article' ? 'Blog · ' : ''}
                      {run.results.length} variant{run.results.length === 1 ? '' : 's'}
                      <span className="sep">·</span>
                      <span className="history-brief-preview">{briefPreview(run.brief)}</span>
                    </span>
                  </summary>
                  <div className="history-run-body">
                    <div className="row tight history-run-toolbar">
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={() => restoreHistoryRun(run)}
                      >
                        Show in output
                      </button>
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={() => deleteHistoryRun(run.id)}
                      >
                        Remove from history
                      </button>
                    </div>
                    {run.usageSummary ? (
                      <div className="usage-panel compact-bottom" role="status">
                        <div className="usage-panel-title">Token usage (saved run)</div>
                        <div className="usage-grid">
                          <div className="usage-metric">
                            <span className="usage-label">Prompt tokens</span>
                            <span className="usage-value">
                              {fmtCount(run.usageSummary.session_totals.prompt_eval_count)}
                            </span>
                          </div>
                          <div className="usage-metric">
                            <span className="usage-label">Completion tokens</span>
                            <span className="usage-value">
                              {fmtCount(run.usageSummary.session_totals.eval_count)}
                            </span>
                          </div>
                          <div className="usage-metric">
                            <span className="usage-label">Total (reported)</span>
                            <span className="usage-value">
                              {fmtTotal(run.usageSummary.session_totals)}
                            </span>
                          </div>
                        </div>
                        {run.usageSummary.usage_notes ? (
                          <p className="usage-note">{run.usageSummary.usage_notes}</p>
                        ) : null}
                      </div>
                    ) : null}
                    <ul className="results">
                      {run.results.map((r, i) => (
                        <li key={`${run.id}-${r.format_id}-${r.tone_id}-${i}`} className="result-block">
                          <div className="result-head">
                            <strong>{r.format_name}</strong>
                            <span className="sep">·</span>
                            <span>{r.tone_name}</span>
                            <button
                              type="button"
                              className="btn secondary small"
                              onClick={() => void navigator.clipboard.writeText(r.content)}
                            >
                              Copy
                            </button>
                          </div>
                          <pre className="result-body">{r.content}</pre>
                          <PublishBar
                            connections={publishConnections}
                            caption={r.content}
                            imageDataUrl={null}
                            tenantsOk={tenantsOk}
                            activeCustomerId={activeCustomerId}
                            showFootnote={false}
                            onPublish={copyAndOpenComposer}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
