import { useState } from 'react'
import { api } from '../lib/api'

const SOURCE_LANGS = ['English', 'Spanish'] as const

export default function Translate() {
  const [translateIn, setTranslateIn] = useState('')
  const [sourceLanguage, setSourceLanguage] = useState<string>(SOURCE_LANGS[0])
  const [translated, setTranslated] = useState('')
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
              <pre className="result-body flat">{translated}</pre>
              <div className="row actions">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => void navigator.clipboard.writeText(translated)}
                >
                  Copy translation
                </button>
              </div>
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
