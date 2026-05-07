import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

type GuardTemplate = {
  id: string
  name: string
  description?: string
  guardrails?: string
  skeleton?: string
  sample?: string
}

const emptyForm = {
  name: '',
  description: '',
  guardrails: '',
  skeleton: '',
  sample: '',
}

export default function Templates() {
  const [list, setList] = useState<GuardTemplate[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ingestPaste, setIngestPaste] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await api<{ templates: GuardTemplate[] }>('/api/templates')
    setList(res.templates || [])
    setError(null)
  }, [])

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [load])

  const selectOne = (t: GuardTemplate) => {
    setSelectedId(t.id)
    setForm({
      name: t.name || '',
      description: t.description || '',
      guardrails: t.guardrails || '',
      skeleton: t.skeleton || '',
      sample: t.sample || '',
    })
    setMsg(null)
  }

  const newTemplate = () => {
    setSelectedId(null)
    setForm(emptyForm)
    setMsg(null)
  }

  const applyPasteToGuardrails = () => {
    if (!ingestPaste.trim()) return
    setForm((f) => {
      const prev = (f.guardrails || '').trimEnd()
      const add = ingestPaste.trim()
      const guardrails = prev ? `${prev}\n\n${add}` : add
      return { ...f, guardrails }
    })
    setMsg('Pasted text appended to Guardrails. Review and save.')
  }

  const saveCreate = async () => {
    if (!form.name.trim()) {
      setError('Name is required.')
      return
    }
    setSaving(true)
    setError(null)
    setMsg(null)
    try {
      if (selectedId) {
        await api(`/api/templates/${encodeURIComponent(selectedId)}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        })
        setMsg('Template updated.')
      } else {
        const created = await api<GuardTemplate>('/api/templates', {
          method: 'POST',
          body: JSON.stringify(form),
        })
        setSelectedId(created.id)
        setMsg('Template created.')
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!selectedId) return
    if (!window.confirm('Delete this template?')) return
    setSaving(true)
    setError(null)
    try {
      await api(`/api/templates/${encodeURIComponent(selectedId)}`, {
        method: 'DELETE',
      })
      setMsg('Template deleted.')
      newTemplate()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-stack">
      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}
      {msg && !msg.startsWith('Error') && <p className="ok banner soft">{msg}</p>}

      <div className="templates-layout">
      <aside className="tpl-sidebar">
        <div className="row spread">
          <h2 className="panel-title">Library</h2>
          <button type="button" className="btn secondary small" onClick={() => void load()}>
            Refresh
          </button>
        </div>
        <button type="button" className="btn secondary block-btn" onClick={newTemplate}>
          New template
        </button>
        {list.length === 0 ? (
          <div className="empty-sidebar">
            <p>No templates yet</p>
            <p className="muted small">Create one to reuse guardrails in Studio.</p>
          </div>
        ) : (
          <ul className="tpl-list">
            {list.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={`tpl-list-item ${selectedId === t.id ? 'active' : ''}`}
                  onClick={() => selectOne(t)}
                >
                  <span className="tpl-list-name">{t.name}</span>
                  {t.description && (
                    <span className="tpl-list-desc">{t.description}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="tpl-editor">
        <section className="step-card">
          <p className="section-eyebrow">Editor</p>
          <h2 className="panel-title flush-top">
            {selectedId ? 'Edit template' : 'Create template'}
          </h2>
          <p className="step-desc">
            <strong>Guardrails</strong> are mandatory rules. <strong>Description</strong> is also sent to the model as
            binding instructions (not just a label). <strong>Structure</strong> is scaffolding (headings, paragraph flow,
            disclosure lines). <strong>Sample</strong> is an optional reference output. In Studio you must{' '}
            <strong>check this template</strong> in step 1 — otherwise edits here are not used.
          </p>

          <div className="ingest-block">
            <label className="field">
              <span>Quick ingest (paste into guardrails)</span>
              <textarea
                className="input"
                rows={3}
                value={ingestPaste}
                onChange={(e) => setIngestPaste(e.target.value)}
                placeholder="Paste a policy doc, checklist, or legal snippet, then move it into Guardrails."
              />
            </label>
            <button type="button" className="btn secondary small" onClick={applyPasteToGuardrails}>
              Append into guardrails
            </button>
          </div>

          <div className="form-grid">
            <label className="field full">
              <span>Name</span>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="field full">
              <span>Description</span>
              <input
                className="input"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </label>
            <label className="field full">
              <span>Guardrails (mandatory)</span>
              <textarea
                className="input code-area"
                value={form.guardrails}
                onChange={(e) => setForm((f) => ({ ...f, guardrails: e.target.value }))}
                spellCheck={false}
              />
            </label>
            <label className="field full">
              <span>Output structure / placeholders (optional)</span>
              <textarea
                className="input code-area"
                value={form.skeleton}
                onChange={(e) => setForm((f) => ({ ...f, skeleton: e.target.value }))}
                spellCheck={false}
                placeholder="e.g. Line1: Hook&#10;Line2: …&#10;Footer: …"
              />
            </label>
            <label className="field full">
              <span>Reference sample (optional)</span>
              <textarea
                className="input code-area short"
                value={form.sample}
                onChange={(e) => setForm((f) => ({ ...f, sample: e.target.value }))}
                spellCheck={false}
              />
            </label>
          </div>

          <div className="row actions">
            <button
              type="button"
              className="btn primary"
              disabled={saving}
              onClick={() => void saveCreate()}
            >
              {selectedId ? 'Save changes' : 'Create template'}
            </button>
            {selectedId && (
              <button
                type="button"
                className="btn danger"
                disabled={saving}
                onClick={() => void remove()}
              >
                Delete
              </button>
            )}
          </div>
        </section>
      </div>
      </div>
    </div>
  )
}
