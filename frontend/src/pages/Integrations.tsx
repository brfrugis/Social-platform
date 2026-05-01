import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { tenantApi } from '../lib/tenantApi'
import { useWorkspace } from '../context/WorkspaceContext'

const PLATFORMS = ['linkedin', 'x', 'instagram', 'facebook'] as const
const STATUSES = ['pending', 'active', 'disabled', 'error'] as const

type Platform = (typeof PLATFORMS)[number]
type Status = (typeof STATUSES)[number]

type LinkedInOut = { author_urn: string }
type XOut = { user_id: string; username?: string | null }
type InstagramOut = { facebook_page_id: string; instagram_user_id: string }
type FacebookOut = { page_id: string }

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
  oauth_scopes_granted?: string | null
  linkedin?: LinkedInOut | null
  x?: XOut | null
  instagram?: InstagramOut | null
  facebook?: FacebookOut | null
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

function identitySummary(r: ConnectionRow): string {
  if (r.linkedin) return r.linkedin.author_urn
  if (r.x) return r.x.username ? `${r.x.user_id} (@${r.x.username})` : r.x.user_id
  if (r.instagram) return `IG ${r.instagram.instagram_user_id} · Page ${r.instagram.facebook_page_id}`
  if (r.facebook) return `Page ${r.facebook.page_id}`
  return r.external_account_id
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
  const [displayLabel, setDisplayLabel] = useState('')
  const [status, setStatus] = useState<Status>('pending')
  const [accessToken, setAccessToken] = useState('')
  const [refreshToken, setRefreshToken] = useState('')
  const [expiresLocal, setExpiresLocal] = useState('')
  const [oauthScopes, setOauthScopes] = useState('')
  const oauthSnapshotRef = useRef('')

  const [linkedinUrn, setLinkedinUrn] = useState('')
  const [xUserId, setXUserId] = useState('')
  const [xUsername, setXUsername] = useState('')
  const [igPageId, setIgPageId] = useState('')
  const [igUserId, setIgUserId] = useState('')
  const [fbPageId, setFbPageId] = useState('')

  const resetForm = useCallback(() => {
    setEditingId(null)
    setPlatform('linkedin')
    setDisplayLabel('')
    setStatus('pending')
    setAccessToken('')
    setRefreshToken('')
    setExpiresLocal('')
    setOauthScopes('')
    oauthSnapshotRef.current = ''
    setLinkedinUrn('')
    setXUserId('')
    setXUsername('')
    setIgPageId('')
    setIgUserId('')
    setFbPageId('')
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

  function hydrateIdentityFromRow(row: ConnectionRow): string {
    setLinkedinUrn('')
    setXUserId('')
    setXUsername('')
    setIgPageId('')
    setIgUserId('')
    setFbPageId('')

    let oauthOut = row.oauth_scopes_granted ?? ''

    if (row.linkedin) {
      setLinkedinUrn(row.linkedin.author_urn)
      setOauthScopes(oauthOut)
      return oauthOut
    }
    if (row.x) {
      setXUserId(row.x.user_id)
      setXUsername(row.x.username ?? '')
      setOauthScopes(oauthOut)
      return oauthOut
    }
    if (row.instagram) {
      setIgPageId(row.instagram.facebook_page_id)
      setIgUserId(row.instagram.instagram_user_id)
      setOauthScopes(oauthOut)
      return oauthOut
    }
    if (row.facebook) {
      setFbPageId(row.facebook.page_id)
      setOauthScopes(oauthOut)
      return oauthOut
    }

    const m = row.connection_metadata
    const li = m.linkedin
    if (row.platform === 'linkedin' && li && typeof li === 'object' && 'author_urn' in li) {
      setLinkedinUrn(String((li as { author_urn: string }).author_urn))
    }
    const xi = m.x
    if (row.platform === 'x' && xi && typeof xi === 'object') {
      if ('user_id' in xi) setXUserId(String((xi as { user_id: string }).user_id))
      if ('username' in xi && (xi as { username?: string }).username)
        setXUsername(String((xi as { username: string }).username))
    }
    const ig = m.instagram
    if (row.platform === 'instagram' && ig && typeof ig === 'object') {
      if ('facebook_page_id' in ig) setIgPageId(String((ig as { facebook_page_id: string }).facebook_page_id))
      if ('instagram_user_id' in ig) setIgUserId(String((ig as { instagram_user_id: string }).instagram_user_id))
    }
    const fb = m.facebook
    if (row.platform === 'facebook' && fb && typeof fb === 'object' && 'page_id' in fb) {
      setFbPageId(String((fb as { page_id: string }).page_id))
    }
    const oauth = m.oauth
    if (!row.oauth_scopes_granted && oauth && typeof oauth === 'object' && 'scopes_granted' in oauth) {
      oauthOut = String((oauth as { scopes_granted: string }).scopes_granted)
    }
    setOauthScopes(oauthOut)
    return oauthOut
  }

  function startEdit(row: ConnectionRow) {
    const p = row.platform as Platform
    setEditingId(row.id)
    setPlatform(PLATFORMS.includes(p) ? p : 'linkedin')
    setDisplayLabel(row.display_label ?? '')
    setStatus((STATUSES.includes(row.status as Status) ? row.status : 'pending') as Status)
    setAccessToken('')
    setRefreshToken('')
    setExpiresLocal(isoToDatetimeLocal(row.token_expires_at))
    oauthSnapshotRef.current = hydrateIdentityFromRow(row)
    setInfo(null)
    setErr(null)
  }

  function validateIdentity(): string | null {
    if (platform === 'linkedin') {
      const u = linkedinUrn.trim()
      if (!u) return 'LinkedIn author URN is required.'
      if (!/^urn:li:(person|organization):[A-Za-z0-9_-]+$/.test(u)) {
        return 'LinkedIn URN must be urn:li:person:{id} or urn:li:organization:{id}.'
      }
    }
    if (platform === 'x') {
      if (!xUserId.trim()) return 'X user id is required (numeric).'
      if (!/^\d+$/.test(xUserId.trim())) return 'X user id must be digits only.'
    }
    if (platform === 'instagram') {
      if (!igPageId.trim() || !/^\d+$/.test(igPageId.trim())) return 'Facebook Page ID must be numeric.'
      if (!igUserId.trim() || !/^\d+$/.test(igUserId.trim())) return 'Instagram user id must be numeric.'
    }
    if (platform === 'facebook') {
      if (!fbPageId.trim() || !/^\d+$/.test(fbPageId.trim())) return 'Facebook Page ID must be numeric.'
    }
    return null
  }

  function buildCreateBody(): Record<string, unknown> {
    const base: Record<string, unknown> = {
      platform,
      display_label: displayLabel.trim() || null,
      status,
      access_token: accessToken.trim() || null,
      refresh_token: refreshToken.trim() || null,
      token_expires_at: datetimeLocalToIso(expiresLocal),
      oauth_scopes_granted: oauthScopes.trim() || null,
    }
    if (platform === 'linkedin') base.linkedin = { author_urn: linkedinUrn.trim() }
    if (platform === 'x') {
      base.x = { user_id: xUserId.trim(), username: xUsername.trim() || null }
    }
    if (platform === 'instagram') {
      base.instagram = {
        facebook_page_id: igPageId.trim(),
        instagram_user_id: igUserId.trim(),
      }
    }
    if (platform === 'facebook') base.facebook = { page_id: fbPageId.trim() }
    return base
  }

  function buildPatchBody(): Record<string, unknown> {
    const patch: Record<string, unknown> = {
      display_label: displayLabel.trim() || null,
      status,
      token_expires_at: datetimeLocalToIso(expiresLocal),
    }
    const ogNext = oauthScopes.trim()
    const ogPrev = (oauthSnapshotRef.current || '').trim()
    if (ogNext !== ogPrev) {
      patch.oauth_scopes_granted = ogNext || null
    }
    if (accessToken.trim()) patch.access_token = accessToken.trim()
    if (refreshToken.trim()) patch.refresh_token = refreshToken.trim()
    if (platform === 'linkedin') patch.linkedin = { author_urn: linkedinUrn.trim() }
    if (platform === 'x') patch.x = { user_id: xUserId.trim(), username: xUsername.trim() || null }
    if (platform === 'instagram') {
      patch.instagram = {
        facebook_page_id: igPageId.trim(),
        instagram_user_id: igUserId.trim(),
      }
    }
    if (platform === 'facebook') patch.facebook = { page_id: fbPageId.trim() }
    return patch
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!activeCustomerId || tenantsOk !== true) return
    setErr(null)
    setInfo(null)

    const v = validateIdentity()
    if (v) {
      setErr(v)
      return
    }

    setLoading(true)
    try {
      if (editingId) {
        await tenantApi(principalId, `/api/tenants/customers/${activeCustomerId}/connections/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(buildPatchBody()),
        })
        setInfo('Connection updated.')
        oauthSnapshotRef.current = oauthScopes.trim()
      } else {
        await tenantApi(principalId, `/api/tenants/customers/${activeCustomerId}/connections`, {
          method: 'POST',
          body: JSON.stringify(buildCreateBody()),
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
            Open <strong>Workspace</strong>, pick or create a customer, then return here.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="page-stack">
      <p className="translate-lead">
        Customer <strong>{activeCustomer?.name ?? activeCustomerId}</strong> — connections must match each vendor’s
        identity rules (URNs, Graph IDs, X user ids). See <strong>docs/INTEGRATIONS_PLATFORMS.md</strong> in the repo
        for requirements, official links, and JSON examples. Tokens are optional for local testing and are never
        returned from the API.
      </p>

      <section className="step-card">
        <div className="step-head">
          <span className="step-num">{editingId ? '✎' : '+'}</span>
          <div>
            <h2 className="step-title">{editingId ? 'Edit connection' : 'Add connection'}</h2>
            <p className="step-desc">
              Pick a platform, fill the required fields for that network only, then save. Leave tokens blank on edit to
              keep existing secrets.
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

            {platform === 'linkedin' && (
              <label className="field full" style={{ gridColumn: '1 / -1' }}>
                <span>LinkedIn author URN (required)</span>
                <input
                  className="input"
                  value={linkedinUrn}
                  onChange={(e) => setLinkedinUrn(e.target.value)}
                  placeholder="urn:li:organization:2414183 or urn:li:person:…"
                  disabled={Boolean(editingId)}
                />
              </label>
            )}

            {platform === 'x' && (
              <>
                <label className="field full">
                  <span>X user id (required, numeric)</span>
                  <input
                    className="input"
                    value={xUserId}
                    onChange={(e) => setXUserId(e.target.value)}
                    placeholder="From GET /2/users/me"
                    disabled={Boolean(editingId)}
                  />
                </label>
                <label className="field full">
                  <span>X username (optional)</span>
                  <input
                    className="input"
                    value={xUsername}
                    onChange={(e) => setXUsername(e.target.value)}
                    placeholder="without @"
                  />
                </label>
              </>
            )}

            {platform === 'instagram' && (
              <>
                <label className="field full">
                  <span>Facebook Page ID (required)</span>
                  <input
                    className="input"
                    value={igPageId}
                    onChange={(e) => setIgPageId(e.target.value)}
                    placeholder="Numeric Page id linked to the IG account"
                    disabled={Boolean(editingId)}
                  />
                </label>
                <label className="field full">
                  <span>Instagram user id (required)</span>
                  <input
                    className="input"
                    value={igUserId}
                    onChange={(e) => setIgUserId(e.target.value)}
                    placeholder="IG User id from instagram_business_account"
                    disabled={Boolean(editingId)}
                  />
                </label>
              </>
            )}

            {platform === 'facebook' && (
              <label className="field full" style={{ gridColumn: '1 / -1' }}>
                <span>Facebook Page ID (required)</span>
                <input
                  className="input"
                  value={fbPageId}
                  onChange={(e) => setFbPageId(e.target.value)}
                  placeholder="Numeric Page id"
                  disabled={Boolean(editingId)}
                />
              </label>
            )}

            <label className="field full">
              <span>OAuth scopes granted (optional, audit)</span>
              <input
                className="input"
                value={oauthScopes}
                onChange={(e) => setOauthScopes(e.target.value)}
                placeholder="Space-separated scopes from the token response"
              />
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
                  <th>Identity</th>
                  <th>Status</th>
                  <th>Scopes</th>
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
                    <td className="cell-mono">{identitySummary(r)}</td>
                    <td>
                      <span className={`status-tag status-tag-${r.status}`}>{r.status}</span>
                    </td>
                    <td className="muted small" title={r.oauth_scopes_granted ?? ''}>
                      {r.oauth_scopes_granted
                        ? r.oauth_scopes_granted.length > 42
                          ? `${r.oauth_scopes_granted.slice(0, 42)}…`
                          : r.oauth_scopes_granted
                        : '—'}
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
                        onClick={() => void onDelete(r.id, r.display_label || identitySummary(r))}
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
