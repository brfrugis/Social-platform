import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'

type Presets = { formats: unknown[]; tones: unknown[] }

export default function Library() {
  const [presetJson, setPresetJson] = useState('')
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const p = await api<Presets>('/api/presets')
    setPresetJson(JSON.stringify(p, null, 2))
    setError(null)
  }, [])

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [load])

  const lineCount = useMemo(() => presetJson.split('\n').length, [presetJson])

  const savePresets = async () => {
    setSaveMsg(null)
    setError(null)
    try {
      const parsed = JSON.parse(presetJson) as Presets
      await api('/api/presets', {
        method: 'PUT',
        body: JSON.stringify({
          formats: parsed.formats,
          tones: parsed.tones,
        }),
      })
      setSaveMsg('Saved. Reloaded from server.')
      await load()
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="page-stack">
      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}

      <section className="step-card">
        <div className="library-toolbar">
          <div>
            <h2 className="panel-title flush-top">Formats and tones</h2>
            <p className="step-desc" style={{ margin: '0.35rem 0 0' }}>
              Stored in <code>data/presets.json</code>. Use <code>sample</code> on each
              format and tone for on-brand references.
            </p>
          </div>
          <span className="library-meta">{lineCount} lines</span>
        </div>

        <textarea
          className="input code"
          value={presetJson}
          onChange={(e) => setPresetJson(e.target.value)}
          spellCheck={false}
        />

        <div className="row actions">
          <button type="button" className="btn primary" onClick={() => void savePresets()}>
            Save presets
          </button>
          <button type="button" className="btn secondary" onClick={() => void load()}>
            Reload from server
          </button>
        </div>

        {saveMsg && (
          <p className={`save-feedback ${saveMsg.startsWith('Saved') ? 'ok' : 'banner error'}`}>
            {saveMsg}
          </p>
        )}
      </section>
    </div>
  )
}
