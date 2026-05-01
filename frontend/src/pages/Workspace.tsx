import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { tenantApi } from '../lib/tenantApi'
import { useWorkspace } from '../context/WorkspaceContext'

type UsageWindow = '24h' | '48h' | '7d' | '30d'

type TokenUsageBucket = { prompt_tokens: number; completion_tokens: number }

type WorkspaceUsage = {
  window: string
  since: string
  until: string
  totals: TokenUsageBucket
  by_operation: Record<string, TokenUsageBucket>
  event_count: number
}

const USAGE_WINDOWS: { id: UsageWindow; label: string }[] = [
  { id: '24h', label: 'Last 24 hours' },
  { id: '48h', label: 'Last 48 hours' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days (monthly)' },
]

function fmtTok(n: number): string {
  return n.toLocaleString()
}

type Bootstrap = {
  customer: { id: string; name: string; slug: string | null; created_at: string }
  membership: { role: string; principal_id: string }
}

export default function Workspace() {
  const {
    principalId,
    setPrincipalId,
    activeCustomerId,
    setActiveCustomerId,
    customers,
    refreshCustomers,
    tenantsOk,
    tenantsNotice,
  } = useWorkspace()

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [usageWindow, setUsageWindow] = useState<UsageWindow>('24h')
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageErr, setUsageErr] = useState<string | null>(null)
  const [usage, setUsage] = useState<WorkspaceUsage | null>(null)

  const loadUsage = useCallback(async () => {
    if (!activeCustomerId || tenantsOk !== true) {
      setUsage(null)
      return
    }
    setUsageLoading(true)
    setUsageErr(null)
    try {
      const u = await tenantApi<WorkspaceUsage>(
        principalId,
        `/api/tenants/customers/${activeCustomerId}/usage/tokens?window=${usageWindow}`,
      )
      setUsage(u)
    } catch (e) {
      setUsageErr(e instanceof Error ? e.message : 'Failed to load usage')
      setUsage(null)
    } finally {
      setUsageLoading(false)
    }
  }, [principalId, activeCustomerId, tenantsOk, usageWindow])

  useEffect(() => {
    void loadUsage()
  }, [loadUsage])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    setMsg(null)
    const n = name.trim()
    if (!n) {
      setErr('Name is required.')
      return
    }
    setBusy(true)
    try {
      const body: { name: string; slug?: string } = { name: n }
      const s = slug.trim()
      if (s) body.slug = s
      const res = await tenantApi<Bootstrap>(principalId, '/api/tenants/customers', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setName('')
      setSlug('')
      setMsg(`Created “${res.customer.name}”. You are ${res.membership.role}.`)
      await refreshCustomers()
      setActiveCustomerId(res.customer.id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create customer')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(id: string, label: string) {
    if (!window.confirm(`Delete customer “${label}” and all integrations? This cannot be undone.`)) return
    setErr(null)
    setBusy(true)
    try {
      await tenantApi(principalId, `/api/tenants/customers/${id}`, { method: 'DELETE' })
      if (activeCustomerId === id) setActiveCustomerId(null)
      setMsg(`Removed “${label}”.`)
      await refreshCustomers()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-stack">
      <p className="translate-lead">
        Phase 4 <strong>workspace</strong>: pick who you are (<code className="kbd">X-Principal-Id</code>), create or
        select a <strong>customer</strong> (tenant). Integrations are scoped to the active customer.
      </p>

      {tenantsOk === false && (
        <div className="banner soft" role="status">
          <strong>Tenant database unavailable.</strong> From the repo root run{' '}
          <code className="kbd">docker compose up -d</code>, then{' '}
          <code className="kbd">cd backend && alembic upgrade head</code>. Restart the API (
          <code className="kbd">DATABASE_URL</code> defaults to Docker Postgres — leave unset unless you need another URL).
          Studio and Translate still work without it.
          {tenantsNotice && (
            <p className="hint" style={{ marginBottom: 0 }}>
              <strong>Detail:</strong> {tenantsNotice}
            </p>
          )}
        </div>
      )}

      <section className="step-card">
        <div className="step-head">
          <span className="step-num">1</span>
          <div>
            <h2 className="step-title">Principal (local identity)</h2>
            <p className="step-desc">
              Until Cognito is wired, this value is sent as <code className="kbd">X-Principal-Id</code>. Changing it
              switches whose customers you see.
            </p>
          </div>
        </div>
        <label className="field full">
          <span>Principal ID</span>
          <input
            className="input"
            value={principalId}
            onChange={(e) => setPrincipalId(e.target.value)}
            placeholder="local-dev"
            autoComplete="off"
          />
        </label>
        <div className="row actions tight">
          <button type="button" className="btn secondary small" onClick={() => void refreshCustomers()} disabled={busy}>
            Reload customers
          </button>
        </div>
      </section>

      <section className="step-card">
        <div className="step-head">
          <span className="step-num">2</span>
          <div>
            <h2 className="step-title">Active customer</h2>
            <p className="step-desc">
              Selecting a customer scopes <strong>Integrations</strong>, attributes <strong>token usage</strong> from
              Studio and Translate when you run them with this customer active, and shows in the top bar when the API is
              up.
            </p>
          </div>
        </div>
        {tenantsOk !== true ? (
          <p className="muted small">Connect the database to list customers.</p>
        ) : customers.length === 0 ? (
          <p className="muted small">No customers yet — create one below (you become admin).</p>
        ) : (
          <ul className="workspace-customer-list">
            {customers.map((c) => (
              <li key={c.id} className="workspace-customer-row">
                <label className="workspace-radio">
                  <input
                    type="radio"
                    name="active-customer"
                    checked={activeCustomerId === c.id}
                    onChange={() => setActiveCustomerId(c.id)}
                  />
                  <span className="workspace-customer-main">
                    <span className="workspace-customer-name">{c.name}</span>
                    {c.slug && (
                      <span className="workspace-customer-slug">
                        <code className="kbd">{c.slug}</code>
                      </span>
                    )}
                  </span>
                </label>
                <button
                  type="button"
                  className="btn danger small"
                  disabled={busy}
                  onClick={() => void onDelete(c.id, c.name)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {tenantsOk === true && activeCustomerId && (
        <section className="step-card">
          <p className="section-eyebrow">Ollama usage</p>
          <div className="step-head">
            <div>
              <h2 className="step-title">Consolidated token usage</h2>
              <p className="step-desc">
                Totals from logged API calls for this customer when your principal is a member. Counts follow Ollama{' '}
                <code className="kbd">prompt_eval_count</code> and <code className="kbd">eval_count</code> per request.
              </p>
            </div>
            <div className="row tight">
              <label className="field">
                <span className="sr-only">Time range</span>
                <select
                  className="input input-compact"
                  value={usageWindow}
                  onChange={(e) => setUsageWindow(e.target.value as UsageWindow)}
                  aria-label="Time range for token usage"
                >
                  {USAGE_WINDOWS.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn secondary small" onClick={() => void loadUsage()} disabled={busy}>
                {usageLoading ? 'Loading…' : 'Refresh'}
              </button>
            </div>
          </div>
          {usageErr && (
            <div className="banner error" role="alert">
              {usageErr}
            </div>
          )}
          {usage && !usageErr && (
            <>
              <div className="usage-panel compact-bottom" role="status">
                <div className="usage-panel-title">Totals · {usage.event_count} logged call(s)</div>
                <div className="usage-grid">
                  <div className="usage-metric">
                    <span className="usage-label">Prompt tokens</span>
                    <span className="usage-value">{fmtTok(usage.totals.prompt_tokens)}</span>
                  </div>
                  <div className="usage-metric">
                    <span className="usage-label">Completion tokens</span>
                    <span className="usage-value">{fmtTok(usage.totals.completion_tokens)}</span>
                  </div>
                  <div className="usage-metric">
                    <span className="usage-label">Sum (both)</span>
                    <span className="usage-value">
                      {fmtTok(usage.totals.prompt_tokens + usage.totals.completion_tokens)}
                    </span>
                  </div>
                </div>
                <p className="usage-hint muted small" style={{ marginBottom: 0 }}>
                  Window {usage.window}: {new Date(usage.since).toLocaleString()} → {new Date(usage.until).toLocaleString()}
                </p>
              </div>
              {Object.keys(usage.by_operation).length > 0 ? (
                <table className="workspace-usage-table">
                  <thead>
                    <tr>
                      <th>Operation</th>
                      <th>Prompt</th>
                      <th>Completion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(usage.by_operation).map(([op, b]) => (
                      <tr key={op}>
                        <td>
                          <code className="kbd">{op}</code>
                        </td>
                        <td>{fmtTok(b.prompt_tokens)}</td>
                        <td>{fmtTok(b.completion_tokens)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted small">No usage rows in this range yet — run Studio or Translate with this customer selected.</p>
              )}
            </>
          )}
        </section>
      )}

      <section className="step-card">
        <div className="step-head">
          <span className="step-num">3</span>
          <div>
            <h2 className="step-title">New customer</h2>
            <p className="step-desc">Creates the tenant and grants you the admin role for this principal.</p>
          </div>
        </div>
        <form className="form-grid" onSubmit={(e) => void onCreate(e)}>
          <label className="field full">
            <span>Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer A" />
          </label>
          <label className="field full">
            <span>Slug (optional)</span>
            <input className="input" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="customer-a" />
          </label>
          {err && (
            <div className="banner error" role="alert">
              {err}
            </div>
          )}
          {msg && (
            <div className="banner soft" role="status">
              {msg}
            </div>
          )}
          <div className="row actions">
            <button type="submit" className="btn primary" disabled={busy || tenantsOk !== true}>
              Create customer
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
