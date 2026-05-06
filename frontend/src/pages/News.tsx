import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslationStudioBridge } from '../context/TranslationStudioBridgeContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { tenantApi } from '../lib/tenantApi'

type NewsSourceRow = {
  id: string
  customer_id: string
  label: string
  feed_url: string
  created_at: string
  last_fetched_at: string | null
}

type NewsItemRow = {
  id: string
  source_id: string
  title: string
  link: string
  summary: string
  published_at: string | null
  fetched_at: string
}

export function formatNewsForStudioBrief(title: string, summary: string, link: string): string {
  const body = summary.trim() || '(no summary — write copy from the headline and source)'
  return `### News reference\n**${title.trim()}**\n\n${body}\n\nSource: ${link.trim()}`
}

export function formatNewsForTranslate(title: string, summary: string, link: string): string {
  const t = title.trim()
  const s = summary.trim()
  return [t, s, link.trim()].filter(Boolean).join('\n\n')
}

export default function News() {
  const { principalId, tenantsOk, activeCustomerId } = useWorkspace()
  const { exportNewsToStudio, exportNewsToTranslate } = useTranslationStudioBridge()

  const [sources, setSources] = useState<NewsSourceRow[]>([])
  const [items, setItems] = useState<NewsItemRow[]>([])
  const [label, setLabel] = useState('')
  const [feedUrl, setFeedUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const base = activeCustomerId ? `/api/tenants/customers/${activeCustomerId}/news` : ''

  const reload = useCallback(async () => {
    if (!activeCustomerId || tenantsOk !== true) {
      setSources([])
      setItems([])
      return
    }
    setErr(null)
    try {
      const [s, it] = await Promise.all([
        tenantApi<NewsSourceRow[]>(principalId, `${base}/sources`),
        tenantApi<NewsItemRow[]>(principalId, `${base}/items?limit=120`),
      ])
      setSources(Array.isArray(s) ? s : [])
      setItems(Array.isArray(it) ? it : [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load news')
      setSources([])
      setItems([])
    }
  }, [principalId, activeCustomerId, tenantsOk, base])

  useEffect(() => {
    void reload()
  }, [reload])

  async function onAddSource(e: FormEvent) {
    e.preventDefault()
    if (!activeCustomerId || tenantsOk !== true) return
    const L = label.trim()
    const U = feedUrl.trim()
    if (!L || !U) {
      setErr('Label and RSS/Atom feed URL are required.')
      return
    }
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      await tenantApi(principalId, `${base}/sources`, {
        method: 'POST',
        body: JSON.stringify({ label: L, feed_url: U }),
      })
      setLabel('')
      setFeedUrl('')
      setMsg(`Added source “${L}”. Click Fetch on the row to ingest items.`)
      await reload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to add source')
    } finally {
      setBusy(false)
    }
  }

  async function fetchOne(id: string) {
    if (!activeCustomerId) return
    setBusy(true)
    setErr(null)
    try {
      const res = await tenantApi<{ inserted: number; updated: number; fetched_entries: number }>(
        principalId,
        `${base}/sources/${id}/fetch`,
        { method: 'POST' },
      )
      setMsg(`Fetched ${res.fetched_entries} entries (${res.inserted} new, ${res.updated} updated).`)
      await reload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fetch failed')
    } finally {
      setBusy(false)
    }
  }

  async function removeSource(id: string, name: string) {
    if (!window.confirm(`Delete source “${name}” and all cached items?`)) return
    setBusy(true)
    setErr(null)
    try {
      await tenantApi(principalId, `${base}/sources/${id}`, { method: 'DELETE' })
      setMsg('Source removed.')
      await reload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  if (tenantsOk !== true || !activeCustomerId) {
    return (
      <div className="page-stack">
        <p className="translate-lead">
          <strong>News</strong> is tied to your active workspace customer. Open <strong>Workspace</strong>, ensure the
          tenant database is online, and select a customer.
        </p>
        {tenantsOk === false && (
          <div className="banner soft" role="status">
            Tenant database unavailable — see Workspace for Docker Postgres steps.
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page-stack">
      <p className="translate-lead">
        Add <strong>RSS or Atom feed URLs</strong> (most news sites publish a feed). Fetch stores headlines and summaries
        for this customer. Send an item to <strong>Translate</strong> or build a <strong>Studio</strong> brief from stored
        content.
      </p>

      {err && (
        <div className="banner banner-inline error" role="alert">
          {err}
        </div>
      )}
      {msg && (
        <div className="banner soft" role="status">
          {msg}
        </div>
      )}

      <section className="step-card">
        <div className="step-head">
          <span className="step-num">1</span>
          <div>
            <h2 className="step-title">Add feed</h2>
            <p className="step-desc">Example: <code className="kbd">https://example.com/feed.xml</code></p>
          </div>
        </div>
        <form className="row actions tight" onSubmit={onAddSource} style={{ flexWrap: 'wrap' }}>
          <label className="field" style={{ minWidth: '12rem', flex: 1 }}>
            <span>Label</span>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Tech news" />
          </label>
          <label className="field" style={{ minWidth: '18rem', flex: 2 }}>
            <span>Feed URL</span>
            <input
              className="input"
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              placeholder="https://…"
              autoComplete="off"
            />
          </label>
          <button type="submit" className="btn primary" disabled={busy}>
            Add source
          </button>
        </form>
      </section>

      <section className="step-card">
        <div className="step-head">
          <span className="step-num">2</span>
          <div>
            <h2 className="step-title">Sources</h2>
          </div>
          <button type="button" className="btn secondary small" onClick={() => void reload()} disabled={busy}>
            Reload
          </button>
        </div>
        {sources.length === 0 ? (
          <p className="muted small">No feeds yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Feed</th>
                <th>Last fetch</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td>{s.label}</td>
                  <td className="muted small">
                    <a href={s.feed_url} target="_blank" rel="noreferrer">
                      {s.feed_url.length > 48 ? `${s.feed_url.slice(0, 48)}…` : s.feed_url}
                    </a>
                  </td>
                  <td className="muted small">{s.last_fetched_at ? new Date(s.last_fetched_at).toLocaleString() : '—'}</td>
                  <td className="row tight" style={{ justifyContent: 'flex-end' }}>
                    <button type="button" className="btn secondary small" disabled={busy} onClick={() => void fetchOne(s.id)}>
                      Fetch
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost small"
                      disabled={busy}
                      onClick={() => void removeSource(s.id, s.label)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="step-card">
        <div className="step-head">
          <span className="step-num">3</span>
          <div>
            <h2 className="step-title">Stored items</h2>
            <p className="step-desc">Use buttons to route text into other tabs (same pattern as Translate → Studio).</p>
          </div>
        </div>
        {items.length === 0 ? (
          <p className="muted small">Fetch a feed to populate items.</p>
        ) : (
          <ul className="news-item-list">
            {items.map((it) => (
              <li key={it.id} className="news-item-card">
                <div className="news-item-head">
                  <a href={it.link} target="_blank" rel="noreferrer">
                    {it.title}
                  </a>
                  <span className="muted small">{new Date(it.fetched_at).toLocaleString()}</span>
                </div>
                {it.summary ? <p className="news-item-summary muted small">{it.summary.replace(/<[^>]+>/g, '')}</p> : null}
                <div className="row tight">
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() =>
                      exportNewsToTranslate(formatNewsForTranslate(it.title, it.summary, it.link), { navigate: true })
                    }
                  >
                    Send to Translate
                  </button>
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() =>
                      exportNewsToStudio(formatNewsForStudioBrief(it.title, it.summary, it.link), { navigate: true })
                    }
                  >
                    Send to Studio brief
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
