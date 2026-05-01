import { useState, type FormEvent } from 'react'
import { tenantApi } from '../lib/tenantApi'
import { useWorkspace } from '../context/WorkspaceContext'

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
              Selecting a customer scopes <strong>Integrations</strong> and shows in the top bar when the API is up.
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
