import { useCallback, useEffect, useState } from 'react'
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
        <h2 className="panel-title">Formats and tones (JSON)</h2>
        <p className="step-desc">
          Advanced configuration stored in <code>data/presets.json</code>. Use{' '}
          <code>sample</code> fields for format and tone references. Back up the file
          before large edits.
        </p>
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
            Reload
          </button>
        </div>
        {saveMsg && (
          <p className={saveMsg.startsWith('Saved') ? 'ok' : 'banner error'}>{saveMsg}</p>
        )}
      </section>
    </div>
  )
}
