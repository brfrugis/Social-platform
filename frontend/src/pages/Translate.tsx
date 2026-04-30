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
      <div className="grid-translate">
        <section className="step-card">
          <h2 className="panel-title">Source</h2>
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
            className="btn primary"
            disabled={translating}
            onClick={() => void runTranslate()}
          >
            {translating ? 'Translating…' : 'Translate to pt-BR'}
          </button>
        </section>
        <section className="step-card">
          <h2 className="panel-title">Brazilian Portuguese</h2>
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
        </section>
      </div>
    </div>
  )
}
