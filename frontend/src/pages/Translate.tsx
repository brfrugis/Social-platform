import { useCallback, useState } from 'react'
import { useTranslationStudioBridge } from '../context/TranslationStudioBridgeContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useLlmSettings } from '../context/LlmSettingsContext'
import { api } from '../lib/api'
import { llmRequestHeaders, textLlmJsonFields } from '../lib/llmSettingsStorage'

const SOURCE_LANGS = ['English', 'Spanish'] as const

type TokenUsage = { prompt_eval_count: number | null; eval_count: number | null }

function fmtCount(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString()
}

export default function Translate() {
  const { principalId, tenantsOk, activeCustomerId } = useWorkspace()
  const { prefs: llmPrefs } = useLlmSettings()
  const {
    exportTranslationToStudio,
    hasPendingNewsTranslate,
    queuedNewsTranslateText,
    consumePendingNewsForTranslate,
    clearPendingNewsForTranslate,
  } = useTranslationStudioBridge()
  const [translateIn, setTranslateIn] = useState('')
  const [sourceLanguage, setSourceLanguage] = useState<string>(SOURCE_LANGS[0])
  const [translated, setTranslated] = useState('')
  const [usage, setUsage] = useState<TokenUsage | null>(null)
  const [usageNotes, setUsageNotes] = useState('')
  const [translating, setTranslating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runTranslate = async () => {
    if (!translateIn.trim()) {
      setError('Paste text to translate.')
      return
    }
    setTranslating(true)
    setError(null)
    setTranslated('')
    setUsage(null)
    setUsageNotes('')
    try {
      const res = await api<{
        translated: string
        usage: TokenUsage
        usage_notes?: string
      }>('/api/translate', {
        method: 'POST',
        headers: llmRequestHeaders(principalId, llmPrefs),
        body: JSON.stringify({
          text: translateIn,
          source_language: sourceLanguage,
          temperature: 0.3,
          ...textLlmJsonFields(llmPrefs),
          ...(tenantsOk === true && activeCustomerId ? { customer_id: activeCustomerId } : {}),
        }),
      })
      setTranslated(res.translated)
      setUsage(res.usage ?? null)
      setUsageNotes(res.usage_notes ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setTranslating(false)
    }
  }

  const bringFromNews = useCallback(() => {
    if (!hasPendingNewsTranslate) {
      setError('No news text queued. On the News tab, use Send to Translate on a stored item.')
      return
    }
    const queued = queuedNewsTranslateText.trim()
    if (!queued) {
      setError('Nothing to import. Try sending again from News.')
      return
    }
    if (translateIn.trim()) {
      if (
        !window.confirm(
          `Replace the current source text (${translateIn.length} characters) with the queued news (${queued.length} characters)?`,
        )
      ) {
        return
      }
    }
    const applied = consumePendingNewsForTranslate()
    if (!applied?.trim()) {
      setError('Queued text was cleared. Try sending again from News.')
      return
    }
    setTranslateIn(applied)
    setError(null)
  }, [
    hasPendingNewsTranslate,
    queuedNewsTranslateText,
    consumePendingNewsForTranslate,
    translateIn,
  ])

  return (
    <div className="page-stack">
      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}

      <p className="translate-lead">
        Same local model as Studio, tuned for faithful Brazilian Portuguese. Best for
        posts, captions, and client-facing copy.
      </p>

      <div className="grid-translate">
        <section className="step-card">
          <p className="section-eyebrow">Source</p>
          <h2 className="panel-title flush-top">Paste your text</h2>
          <label className="field">
            <span>Language</span>
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value)}
            >
              {SOURCE_LANGS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <div className="row tight" style={{ flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.35rem' }}>
            <button
              type="button"
              className={`btn small ${hasPendingNewsTranslate ? 'primary' : 'secondary'}`}
              onClick={() => bringFromNews()}
            >
              Bring from news
            </button>
            {hasPendingNewsTranslate && (
              <button type="button" className="btn secondary small" onClick={() => clearPendingNewsForTranslate()}>
                Discard queued news
              </button>
            )}
          </div>
          {hasPendingNewsTranslate && (
            <p className="hint small" style={{ marginTop: 0 }}>
              Headlines from <strong>News</strong> are queued — click <strong>Bring from news</strong> to paste into the
              source box.
            </p>
          )}
          <textarea
            className="input tall"
            value={translateIn}
            onChange={(e) => setTranslateIn(e.target.value)}
            placeholder="Paste paragraphs here. Line breaks are preserved when possible."
          />
          <button
            type="button"
            className="btn primary"
            disabled={translating}
            onClick={() => void runTranslate()}
          >
            {translating ? 'Translating…' : 'Translate to pt-BR'}
          </button>
        </section>

        <section className="step-card">
          <p className="section-eyebrow">Result</p>
          <h2 className="panel-title flush-top">Brazilian Portuguese</h2>
          {translated ? (
            <>
              {usage && (
                <div className="usage-panel compact-bottom">
                  <div className="usage-panel-title">Token usage (this translation)</div>
                  <div className="usage-grid">
                    <div className="usage-metric">
                      <span className="usage-label">Prompt tokens</span>
                      <span className="usage-value">{fmtCount(usage.prompt_eval_count)}</span>
                    </div>
                    <div className="usage-metric">
                      <span className="usage-label">Completion tokens</span>
                      <span className="usage-value">{fmtCount(usage.eval_count)}</span>
                    </div>
                    <div className="usage-metric">
                      <span className="usage-label">Total (reported)</span>
                      <span className="usage-value">
                        {usage.prompt_eval_count != null && usage.eval_count != null
                          ? (usage.prompt_eval_count + usage.eval_count).toLocaleString()
                          : '—'}
                      </span>
                    </div>
                  </div>
                  {usageNotes ? <p className="usage-note">{usageNotes}</p> : null}
                </div>
              )}
              <pre className="result-body flat">{translated}</pre>
              <div className="row actions">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => void navigator.clipboard.writeText(translated)}
                >
                  Copy translation
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => exportTranslationToStudio(translated, { navigate: true })}
                  title="Send this text to Studio as the brief and open Studio"
                >
                  Export to Studio
                </button>
              </div>
              <p className="hint">
                <strong>Export to Studio</strong> saves this result for Studio and opens the Studio tab. In Studio →
                Brief, click <strong>Bring from translation</strong> to paste it into the brief (and set output language
                to Brazilian Portuguese).
              </p>
            </>
          ) : (
            <div className="empty-out empty-out-tight">
              <strong>Output will show here</strong>
              <span className="muted">
                Run a translation to see natural pt-BR phrasing and idioms.
              </span>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
