import { useCallback, useEffect, useState } from 'react'
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
}

const OUTPUT_LANGS = ['Portuguese (Brazil)', 'English', 'Spanish'] as const

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
  const [error, setError] = useState<string | null>(null)

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
    try {
      const res = await api<{ results: GenResult[] }>('/api/generate', {
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

      <section className="step-card">
        <div className="step-head">
          <span className="step-num">1</span>
          <div>
            <h2 className="step-title">Guardrail templates</h2>
            <p className="step-desc">
              Ingest reusable rules under Templates. Select any combination here; they
              apply to every variant you generate in this run.
            </p>
          </div>
          <span className="step-badge">{selectedTplCount} selected</span>
        </div>
        {templates.length === 0 ? (
          <p className="muted">
            No templates yet. Open <strong>Templates</strong> in the sidebar to add
            guardrails (claims, disclosures, structure, brand voice limits).
          </p>
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
              <h2 className="step-title">Brief and model</h2>
              <p className="step-desc">What you need written, plus language and creativity.</p>
            </div>
          </div>
          <textarea
            className="input tall"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Topic, product, audience, facts to include, words to avoid…"
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
            <label className="field">
              <span>Temperature</span>
              <input
                type="number"
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
              {generating ? 'Generating…' : 'Run generation'}
            </button>
            <button type="button" className="btn secondary" onClick={() => void load()}>
              Reload data
            </button>
          </div>
          <p className="hint">
            Each format and tone pair runs one model call. Large batches can take a long
            time on CPU.
          </p>
        </section>

        <section className="step-card">
          <div className="step-head">
            <span className="step-num">3</span>
            <div>
              <h2 className="step-title">Formats and tones</h2>
              <p className="step-desc">Pick one or more combinations to produce in parallel.</p>
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
              <p className="muted">
                No formats or tones. Configure them under <strong>Formats and tones</strong>.
              </p>
            ) : (
              presets.formats.map((f) => (
                <div key={f.id} className="matrix-row">
                  <div className="matrix-format">{f.name}</div>
                  <div className="matrix-cells">
                    {presets.tones.map((t) => {
                      const k = `${f.id}::${t.id}`
                      const on = !!selectedPairs[k]
                      return (
                        <label key={k} className={`chip ${on ? 'on' : ''}`}>
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
            <p className="step-desc">Copy results into your scheduling tool.</p>
          </div>
        </div>
        {results.length === 0 ? (
          <p className="muted">Generated copy appears here after you run generation.</p>
        ) : (
          <ul className="results">
            {results.map((r, i) => (
              <li key={`${r.format_id}-${r.tone_id}-${i}`} className="result-block">
                <div className="result-head">
                  <strong>{r.format_name}</strong>
                  <span className="sep">·</span>
                  <span>{r.tone_name}</span>
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
        )}
      </section>
    </div>
  )
}
