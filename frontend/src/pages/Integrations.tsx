import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { tenantApi } from '../lib/tenantApi'
import { useWorkspace } from '../context/WorkspaceContext'

const PLATFORMS = ['linkedin', 'x', 'instagram', 'facebook', 'other'] as const
const STATUSES = ['pending', 'active', 'disabled', 'error'] as const

type Platform = (typeof PLATFORMS)[number]
type Status = (typeof STATUSES)[number]

type ConnectionRow = {
  id: string
  customer_id: string
  platform: string
  external_account_id: string
  display_label: string | null
  status: string
  has_access_token: boolean
  has_refresh_token: boolean
  token_expires_at: string | null
  connection_metadata: Record<string, unknown>
  created_at: string
}

function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function datetimeLocalToIso(v: string): string | null {
  const t = v.trim()
  if (!t) return null
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export default function Integrations() {
  const { principalId, activeCustomerId, customers, tenantsOk, tenantsNotice } = useWorkspace()

  const activeCustomer = customers.find((c) => c.id === activeCustomerId)

  const [rows, setRows] = useState<ConnectionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [platform, setPlatform] = useState<Platform>('linkedin')
  const [externalId, setExternalId] = useState('')
  const [displayLabel, setDisplayLabel] = useState('')
  const [status, setStatus] = useState<Status>('pending')
  const [accessToken, setAccessToken] = useState('')
  const [refreshToken, setRefreshToken] = useState('')
  const [expiresLocal, setExpiresLocal] = useState('')
  const [metadataJson, setMetadataJson] = useState('{}')

  const resetForm = useCallback(() => {
    setEditingId(null)
    setPlatform('linkedin')
    setExternalId('')
    setDisplayLabel('')
    setStatus('pending')
    setAccessToken('')
    setRefreshToken('')
    setExpiresLocal('')
    setMetadataJson('{}')
  }, [])

  const loadConnections = useCallback(async () => {
    if (!activeCustomerId || tenantsOk !== true) {
      setRows([])
      return
    }
    setLoading(true)
    setErr(null)
    try {
      const list = await tenantApi<ConnectionRow[]>(
        principalId,
        `/api/tenants/customers/${activeCustomerId}/connections`,
      )
      setRows(list)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load connections')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [principalId, activeCustomerId, tenantsOk])

  useEffect(() => {
    void loadConnections()
  }, [loadConnections])

  function startEdit(row: ConnectionRow) {
    setEditingId(row.id)
    setPlatform((PLATFORMS.includes(row.platform as Platform) ? row.platform : 'other') as Platform)
    setExternalId(row.external_account_id)
    setDisplayLabel(row.display_label ?? '')
    setStatus((STATUSES.includes(row.status as Status) ? row.status : 'pending') as Status)
    setAccessToken('')
    setRefreshToken('')
    setExpiresLocal(isoToDatetimeLocal(row.token_expires_at))
    setMetadataJson(JSON.stringify(row.connection_metadata ?? {}, null, 2))
    setInfo(null)
    setErr(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!activeCustomerId || tenantsOk !== true) return
    setErr(null)
    setInfo(null)

    let meta: Record<string, unknown> = {}
    const mj = metadataJson.trim()
    if (mj) {
      try {
        meta = JSON.parse(mj) as Record<string, unknown>
        if (typeof meta !== 'object' || meta === null) throw new Error('Metadata must be a JSON object')
      } catch (ex) {
        setErr(ex instanceof Error ? ex.message : 'Invalid JSON metadata')
        return
      }
    }

    const ext = externalId.trim()
    if (!ext) {
      setErr('External account ID is required.')
      return
    }

    setLoading(true)
    try {
      if (editingId) {
        const patch: Record<string, unknown> = {
          display_label: displayLabel.trim() || null,
          status,
          connection_metadata: meta,
          token_expires_at: datetimeLocalToIso(expiresLocal),
        }
        if (accessToken.trim()) patch.access_token = accessToken.trim()
        if (refreshToken.trim()) patch.refresh_token = refreshToken.trim()

        await tenantApi(principalId, `/api/tenants/customers/${activeCustomerId}/connections/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        })
        setInfo('Connection updated.')
      } else {
        await tenantApi(principalId, `/api/tenants/customers/${activeCustomerId}/connections`, {
          method: 'POST',
          body: JSON.stringify({
            platform,
            external_account_id: ext,
            display_label: displayLabel.trim() || null,
            status,
            access_token: accessToken.trim() || null,
            refresh_token: refreshToken.trim() || null,
            token_expires_at: datetimeLocalToIso(expiresLocal),
            connection_metadata: meta,
          }),
        })
        setInfo('Connection added.')
      }
      resetForm()
      await loadConnections()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setLoading(false)
    }
  }

  async function onDelete(id: string, label: string) {
    if (!activeCustomerId || tenantsOk !== true) return
    if (!window.confirm(`Remove integration “${label || id}”?`)) return
    setLoading(true)
    setErr(null)
    try {
      await tenantApi(principalId, `/api/tenants/customers/${activeCustomerId}/connections/${id}`, {
        method: 'DELETE',
      })
      setInfo('Connection removed.')
      if (editingId === id) resetForm()
      await loadConnections()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setLoading(false)
    }
  }

  if (tenantsOk !== true) {
    return (
      <div className="page-stack">
        <div className="banner soft" role="status">
          <strong>Tenant API is not available.</strong> Start Postgres and migrations (see <strong>Workspace</strong>{' '}
          for steps). The backend now defaults <code className="kbd">DATABASE_URL</code> to Docker Compose — restart{' '}
          <code className="kbd">uvicorn</code> after pulling changes.
          {tenantsNotice && (
            <p className="hint" style={{ marginBottom: 0 }}>
              <strong>Detail:</strong> {tenantsNotice}
            </p>
          )}
        </div>
      </div>
    )
  }

  if (!activeCustomerId) {
    return (
      <div className="page-stack">
        <div className="empty-out">
          <strong>No active customer</strong>
          <span className="muted small">
            Open <strong>Workspace</strong>, pick or create a customer, then return here to manage LinkedIn, X,
            Instagram, Facebook, and other connections.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="page-stack">
      <p className="translate-lead">
        Social accounts for <strong>{activeCustomer?.name ?? 'customer'}</strong>. Tokens are stored for local testing
        only and are <strong>never</strong> shown back from the API — only whether they are set.
      </p>

      <section className="step-card">
        <div className="step-head">
          <span className="step-num">{editingId ? '✎' : '+'}</span>
          <div>
            <h2 className="step-title">{editingId ? 'Edit connection' : 'Add connection'}</h2>
            <p className="step-desc">
              Unique per customer: platform + external account id. Leave tokens blank to keep existing values when
              editing.
            </p>
          </div>
          {editingId && (
            <button type="button" className="btn secondary small step-badge" onClick={() => resetForm()}>
              Cancel edit
            </button>
          )}
        </div>
        <form className="form-grid" onSubmit={(e) => void onSubmit(e)}>
          <div className="integration-form-grid">
            <label className="field full">
              <span>Platform</span>
              <select
                className="input"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform)}
                disabled={Boolean(editingId)}
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="field full">
              <span>External account ID</span>
              <input
                className="input"
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                placeholder="Platform-specific identifier"
                disabled={Boolean(editingId)}
              />
            </label>
            <label className="field full">
              <span>Display label</span>
              <input
                className="input"
                value={displayLabel}
                onChange={(e) => setDisplayLabel(e.target.value)}
                placeholder="e.g. Acme LinkedIn Page"
              />
            </label>
            <label className="field full">
              <span>Status</span>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="field full">
              <span>Access token (optional, local only)</span>
              <input
                className="input"
                type="password"
                autoComplete="off"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder={editingId ? 'Leave blank to keep stored token' : ''}
              />
            </label>
            <label className="field full">
              <span>Refresh token (optional)</span>
              <input
                className="input"
                type="password"
                autoComplete="off"
                value={refreshToken}
                onChange={(e) => setRefreshToken(e.target.value)}
                placeholder={editingId ? 'Leave blank to keep stored token' : ''}
              />
            </label>
            <label className="field full">
              <span>Token expiry (optional)</span>
              <input
                className="input"
                type="datetime-local"
                value={expiresLocal}
                onChange={(e) => setExpiresLocal(e.target.value)}
              />
            </label>
            <label className="field full">
              <span>Metadata (JSON object)</span>
              <textarea className="input code-area short" value={metadataJson} onChange={(e) => setMetadataJson(e.target.value)} rows={4} />
            </label>
          </div>
          {err && (
            <div className="banner error" role="alert">
              {err}
            </div>
          )}
          {info && (
            <div className="banner soft" role="status">
              {info}
            </div>
          )}
          <div className="row actions">
            <button type="submit" className="btn primary" disabled={loading}>
              {editingId ? 'Save changes' : 'Add connection'}
            </button>
          </div>
        </form>
      </section>

      <section className="step-card step-card-wide">
        <h2 className="panel-title flush-top">Connections</h2>
        {loading && rows.length === 0 ? (
          <p className="muted small">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="empty-out empty-out-tight">
            <strong>No integrations yet</strong>
            <span className="muted small">Add a connection above.</span>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Label</th>
                  <th>External ID</th>
                  <th>Status</th>
                  <th>Tokens</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <code className="kbd">{r.platform}</code>
                    </td>
                    <td>{r.display_label ?? '—'}</td>
                    <td className="cell-mono">{r.external_account_id}</td>
                    <td>
                      <span className={`status-tag status-tag-${r.status}`}>{r.status}</span>
                    </td>
                    <td className="muted small">
                      {r.has_access_token ? 'access · ' : ''}
                      {r.has_refresh_token ? 'refresh' : ''}
                      {!r.has_access_token && !r.has_refresh_token ? '—' : ''}
                    </td>
                    <td className="cell-actions">
                      <button type="button" className="btn secondary small" onClick={() => startEdit(r)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn danger small"
                        disabled={loading}
                        onClick={() => void onDelete(r.id, r.display_label || r.external_account_id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
