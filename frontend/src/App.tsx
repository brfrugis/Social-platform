import { useCallback, useEffect, useState } from 'react'
import './App.css'

type Format = {
  id: string
  name: string
  description: string
  sample?: string
}

type Tone = {
  id: string
  name: string
  instructions: string
  sample?: string
}

type Presets = { formats: Format[]; tones: Tone[] }

type Tab = 'generate' | 'translate' | 'presets'

type GenResult = {
  format_id: string
  tone_id: string
  format_name: string
  tone_name: string
  content: string
}

const OUTPUT_LANGS = [
  'Portuguese (Brazil)',
  'English',
  'Spanish',
] as const

const SOURCE_LANGS = ['English', 'Spanish'] as const

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(t || r.statusText)
  }
  return r.json() as Promise<T>
}

export default function App() {
  const [tab, setTab] = useState<Tab>('generate')
  const [presets, setPresets] = useState<Presets>({ formats: [], tones: [] })
  const [health, setHealth] = useState<string>('')
  const [brief, setBrief] = useState('')
  const [outputLanguage, setOutputLanguage] = useState<string>(OUTPUT_LANGS[0])
  const [selectedPairs, setSelectedPairs] = useState<Record<string, boolean>>({})
  const [temperature, setTemperature] = useState(0.7)
  const [generating, setGenerating] = useState(false)
  const [results, setResults] = useState<GenResult[]>([])
  const [error, setError] = useState<string | null>(null)

  const [translateIn, setTranslateIn] = useState('')
  const [sourceLanguage, setSourceLanguage] = useState<string>(SOURCE_LANGS[0])
  const [translated, setTranslated] = useState('')
  const [translating, setTranslating] = useState(false)

  const [presetJson, setPresetJson] = useState('')
  const [presetSaveMsg, setPresetSaveMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [h, p] = await Promise.all([
        api<{ ollama_model: string; ollama_base_url: string }>('/api/health'),
        api<Presets>('/api/presets'),
      ])
      setHealth(`${h.ollama_model} @ ${h.ollama_base_url}`)
      setPresets(p)
      setPresetJson(JSON.stringify(p, null, 2))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

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
    if (!brief.trim() || items.length === 0) {
      setError('Add a brief and select at least one format + tone combination.')
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

  const runTranslate = async () => {
    if (!translateIn.trim()) {
      setError('Paste text to translate.')
      return
    }
    setTranslating(true)
    setError(null)
    setTranslated('')
    try {
      const res = await api<{ translated: string }>('/api/translate', {
        method: 'POST',
        body: JSON.stringify({
          text: translateIn,
          source_language: sourceLanguage,
          temperature: 0.3,
        }),
      })
      setTranslated(res.translated)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setTranslating(false)
    }
  }

  const savePresets = async () => {
    setPresetSaveMsg(null)
    try {
      const parsed = JSON.parse(presetJson) as Presets
      await api('/api/presets', {
        method: 'PUT',
        body: JSON.stringify({
          formats: parsed.formats,
          tones: parsed.tones,
        }),
      })
      setPresetSaveMsg('Saved. Reloading presets.')
      await load()
    } catch (e) {
      setPresetSaveMsg(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="layout">
      <header className="top">
        <div>
          <h1 className="title">Qwen Social Studio</h1>
          <p className="subtitle">
            Orchestrate formats and tones against a local Qwen 8B model (Ollama),
            then translate English or Spanish into Brazilian Portuguese.
          </p>
        </div>
        <div className="meta">
          <button type="button" className="btn secondary" onClick={() => void load()}>
            Refresh
          </button>
          {health && <span className="pill">{health}</span>}
        </div>
      </header>

      <nav className="tabs" aria-label="Sections">
        {(
          [
            ['generate', 'Generate'],
            ['translate', 'Translate to pt-BR'],
            ['presets', 'Formats & tones'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`tab ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}

      {tab === 'generate' && (
        <section className="panel grid-two">
          <div className="card">
            <h2>Brief</h2>
            <textarea
              className="input tall"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Topic, product, campaign angle, audience, must-include facts…"
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
                className="btn"
                disabled={generating}
                onClick={() => void runGenerate()}
              >
                {generating ? 'Generating…' : 'Generate selected'}
              </button>
            </div>
            <p className="hint">
              Each selected pair runs one model call. Large batches can take several
              minutes on CPU.
            </p>
          </div>

          <div className="card">
            <div className="row spread">
              <h2>Format × tone</h2>
              <div className="row tight">
                <button type="button" className="btn secondary small" onClick={selectAllPairs}>
                  Select all
                </button>
                <button type="button" className="btn secondary small" onClick={clearPairs}>
                  Clear
                </button>
              </div>
            </div>
            <div className="matrix">
              {presets.formats.length === 0 || presets.tones.length === 0 ? (
                <p className="muted">
                  No presets loaded. Add formats and tones in the Presets tab or check
                  <code> data/presets.json</code>.
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
          </div>

          <div className="card wide">
            <h2>Output</h2>
            {results.length === 0 ? (
              <p className="muted">Generated copy appears here.</p>
            ) : (
              <ul className="results">
                {results.map((r, i) => (
                  <li key={`${r.format_id}-${r.tone_id}-${i}`} className="result-block">
                    <div className="result-head">
                      <strong>{r.format_name}</strong>
                      <span className="sep">·</span>
                      <span>{r.tone_name}</span>
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={() =>
                          void navigator.clipboard.writeText(r.content)
                        }
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="result-body">{r.content}</pre>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {tab === 'translate' && (
        <section className="panel grid-translate">
          <div className="card">
            <h2>Source</h2>
            <label className="field">
              <span>Source language</span>
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
            <textarea
              className="input tall"
              value={translateIn}
              onChange={(e) => setTranslateIn(e.target.value)}
              placeholder="Paste Spanish or English text…"
            />
            <button
              type="button"
              className="btn"
              disabled={translating}
              onClick={() => void runTranslate()}
            >
              {translating ? 'Translating…' : 'Translate to pt-BR'}
            </button>
          </div>
          <div className="card">
            <h2>Brazilian Portuguese</h2>
            {translated ? (
              <>
                <pre className="result-body flat">{translated}</pre>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => void navigator.clipboard.writeText(translated)}
                >
                  Copy translation
                </button>
              </>
            ) : (
              <p className="muted">Translation output appears here.</p>
            )}
          </div>
        </section>
      )}

      {tab === 'presets' && (
        <section className="panel">
          <div className="card">
            <h2>Edit presets (JSON)</h2>
            <p className="hint">
              Paste your tone and format samples into the <code>sample</code> fields.
              Keep valid JSON. Back up <code>data/presets.json</code> before risky edits.
            </p>
            <textarea
              className="input code"
              value={presetJson}
              onChange={(e) => setPresetJson(e.target.value)}
              spellCheck={false}
            />
            <div className="row actions">
              <button type="button" className="btn" onClick={() => void savePresets()}>
                Save presets
              </button>
            </div>
            {presetSaveMsg && (
              <p className={presetSaveMsg.startsWith('Saved') ? 'ok' : 'banner error'}>
                {presetSaveMsg}
              </p>
            )}
          </div>
        </section>
      )}

      <footer className="foot">
        <span>
          Model: configure <code>OLLAMA_MODEL</code> (default <code>qwen2.5:8b</code>) in{' '}
          <code>backend/.env</code>.
        </span>
      </footer>
    </div>
  )
}
