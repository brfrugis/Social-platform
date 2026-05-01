import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'

type Format = { id: string; name: string; description: string; sample?: string }
type Tone = { id: string; name: string; instructions: string; sample?: string }
type Presets = { formats: Format[]; tones: Tone[] }
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

export default function Studio() {
  const [presets, setPresets] = useState<Presets>({ formats: [], tones: [] })
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

  const variantCount = useMemo(
    () => Object.values(selectedPairs).filter(Boolean).length,
    [selectedPairs],
  )

  const load = useCallback(async () => {
    const [p, t] = await Promise.all([
      api<Presets>('/api/presets'),
      api<{ templates: GuardTemplate[] }>('/api/templates'),
    ])
    setPresets(p)
    setTemplates(t.templates || [])
    setError(null)
  }, [])

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [load])

  const toggleTemplate = (id: string) => {
    setSelectedTemplateIds((s) => ({ ...s, [id]: !s[id] }))
  }

  const togglePair = (fid: string, tid: string) => {
    const k = `${fid}::${tid}`
    setSelectedPairs((s) => ({ ...s, [k]: !s[k] }))
  }

  const selectAllPairs = () => {
    const next: Record<string, boolean> = {}
    for (const f of presets.formats) {
      for (const t of presets.tones) {
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
    try {
      const res = await api<{
        results: GenResult[]
        session_totals: TokenUsage
        usage_notes?: string
      }>('/api/generate', {
        method: 'POST',
        body: JSON.stringify({
          brief,
          items,
          template_ids,
          output_language: outputLanguage,
          temperature,
        }),
      })
      setResults(res.results)
      setUsageSummary({
        session_totals: res.session_totals,
        usage_notes: res.usage_notes ?? '',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  const selectedTplCount = Object.values(selectedTemplateIds).filter(Boolean).length

  return (
    <div className="page-stack">
      {error && (
        <div className="banner error" role="alert">
          {error}
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
                Describe what to write. Temperature controls randomness: lower is more
                predictable, higher is more varied.
              </p>
            </div>
          </div>
          <textarea
            className="input tall"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Example: Product launch for … Audience: … Include … Avoid …"
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
            Each checked format and tone pair runs one model call. Many variants can take
            noticeable time on CPU.
          </p>
        </section>

        <section className="step-card">
          <div className="step-head">
            <span className="step-num">3</span>
            <div>
              <h2 className="step-title">Formats and tones</h2>
              <p className="step-desc">
                Mix channels and voices. Hover a format name to see its full description.
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
          <div className="matrix scroll-matrix">
            {presets.formats.length === 0 || presets.tones.length === 0 ? (
              <div className="empty-out">
                <strong>Nothing to pick yet</strong>
                <span className="muted">
                  Add formats and tones under <strong>Formats and tones</strong> in the
                  sidebar.
                </span>
              </div>
            ) : (
              presets.formats.map((f) => (
                <div key={f.id} className="matrix-row">
                  <div className="matrix-format" title={f.description}>
                    {f.name}
                  </div>
                  <div className="matrix-cells">
                    {presets.tones.map((t) => {
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
            <p className="step-desc">Review each block and use Copy to paste elsewhere.</p>
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
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
