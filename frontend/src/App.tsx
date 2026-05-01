import { useCallback, useEffect, useState } from 'react'
import { api } from './lib/api'
import NavIcon from './components/NavIcon'
import Studio from './pages/Studio'
import Translate from './pages/Translate'
import Templates from './pages/Templates'
import Workspace from './pages/Workspace'
import Integrations from './pages/Integrations'
import Library from './pages/Library'
import { NAV, type NavId } from './navConfig'
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext'
import { TranslationStudioBridgeProvider, useTranslationStudioBridge } from './context/TranslationStudioBridgeContext'
import './App.css'

function modelFromHealth(health: string): string {
  const i = health.indexOf(' @ ')
  return i === -1 ? health : health.slice(0, i).trim()
}

export default function App() {
  return (
    <WorkspaceProvider>
      <AppWithTranslationBridge />
    </WorkspaceProvider>
  )
}

function AppWithTranslationBridge() {
  const [nav, setNav] = useState<NavId>('studio')
  const goToStudio = useCallback(() => {
    setNav('studio')
  }, [])
  return (
    <TranslationStudioBridgeProvider goToStudio={goToStudio}>
      <AppShell nav={nav} setNav={setNav} />
    </TranslationStudioBridgeProvider>
  )
}

type AppShellProps = {
  nav: NavId
  setNav: (id: NavId) => void
}

function AppShell({ nav, setNav }: AppShellProps) {
  const { tenantsOk, activeCustomerId, customers } = useWorkspace()
  const { hasPendingTranslation } = useTranslationStudioBridge()
  const [health, setHealth] = useState<string>('')
  const [banner, setBanner] = useState<string | null>(null)

  const activeCustomerName =
    activeCustomerId && customers.find((c) => c.id === activeCustomerId)?.name

  const loadHealth = useCallback(async () => {
    try {
      const h = await api<{ ollama_model: string; ollama_base_url: string }>(
        '/api/health',
      )
      setHealth(`${h.ollama_model} @ ${h.ollama_base_url}`)
      setBanner(null)
    } catch (e) {
      setHealth('')
      setBanner(
        e instanceof Error
          ? e.message
          : 'Cannot reach the API. Start the backend on port 8000, then refresh.',
      )
    }
  }, [])

  useEffect(() => {
    void loadHealth()
  }, [loadHealth])

  const current = NAV.find((n) => n.id === nav)

  return (
    <div className="app-shell">
      <aside className="shell-aside" aria-label="Main navigation">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <div>
            <div className="brand-title">GIGI-AI</div>
            <div className="brand-sub">Local content studio</div>
          </div>
        </div>
        <nav className="shell-nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`shell-link ${nav === item.id ? 'active' : ''} ${
                item.id === 'studio' && hasPendingTranslation ? 'shell-link-pending' : ''
              }`}
              onClick={() => setNav(item.id)}
              title={item.hint}
            >
              <span className="shell-link-icon" aria-hidden>
                <NavIcon id={item.id} />
              </span>
              <span className="shell-link-text">
                <span className="shell-link-label">{item.label}</span>
                <span className="shell-link-hint">{item.hint}</span>
              </span>
            </button>
          ))}
        </nav>
        <div className="shell-aside-foot">
          <span className="aside-hint">Runs in your browser. Model stays on your machine via Ollama.</span>
        </div>
      </aside>

      <div className="shell-body">
        <header className="shell-topbar">
          <div className="topbar-titles">
            <h1 className="shell-page-title">{current?.label ?? 'Studio'}</h1>
            <p className="shell-page-sub">{current?.hint}</p>
          </div>
          <div className="topbar-actions">
            {tenantsOk === true && activeCustomerName && (
              <span className="workspace-pill" title="Active Phase 4 customer (Workspace)">
                {activeCustomerName}
              </span>
            )}
            {tenantsOk === false && (
              <span
                className="workspace-pill workspace-pill-muted"
                title="Set DATABASE_URL and run Postgres + migrations"
              >
                Tenant DB offline
              </span>
            )}
            {health ? (
              <span className="status-pill" title={health}>
                <span className="status-dot" aria-hidden />
                {modelFromHealth(health)}
              </span>
            ) : (
              !banner && (
                <span className="status-pill status-pill-muted">Checking connection…</span>
              )
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void loadHealth()}
            >
              Refresh
            </button>
          </div>
        </header>

        {banner && (
          <div className="banner banner-inline error" role="status">
            {banner}
          </div>
        )}

        <main className="shell-content">
          {nav === 'studio' && <Studio />}
          {nav === 'translate' && <Translate />}
          {nav === 'templates' && <Templates />}
          {nav === 'workspace' && <Workspace />}
          {nav === 'integrations' && <Integrations />}
          {nav === 'library' && <Library />}
        </main>

        <footer className="shell-legal">
          GIGI-AI · API <code className="kbd">:8000</code> · UI <code className="kbd">:5173</code> ·
          Configure in <code className="kbd">backend/.env</code>
        </footer>
      </div>
    </div>
  )
}
