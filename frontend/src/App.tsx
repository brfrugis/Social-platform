import { useCallback, useEffect, useState } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { api } from './lib/api'
import NavIcon from './components/NavIcon'
import Studio from './pages/Studio'
import Translate from './pages/Translate'
import Templates from './pages/Templates'
import Workspace from './pages/Workspace'
import Integrations from './pages/Integrations'
import Library from './pages/Library'
import News from './pages/News'
import Settings from './pages/Settings'
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'
import { NAV, type NavId } from './navConfig'
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext'
import { LlmSettingsProvider, useLlmSettings } from './context/LlmSettingsContext'
import { AuthSessionProvider, useAuthSession } from './context/AuthSessionContext'
import { TranslationStudioBridgeProvider, useTranslationStudioBridge } from './context/TranslationStudioBridgeContext'
import type { LlmUserPrefs } from './lib/llmSettingsStorage'
import './App.css'

function modelFromHealth(health: string): string {
  const i = health.indexOf(' @ ')
  return i === -1 ? health : health.slice(0, i).trim()
}

/** What the top bar shows: Settings text provider when not Ollama; else default Ollama tag from health. */
function statusPillPrimary(health: string, prefs: LlmUserPrefs): string {
  if (!health) return ''
  if (prefs.textProvider !== 'ollama') {
    const m = prefs.textModel.trim()
    const label =
      prefs.textProvider === 'openai'
        ? 'OpenAI'
        : prefs.textProvider === 'anthropic'
          ? 'Anthropic'
          : 'Gemini'
    return m ? `${label} · ${m}` : `${label} (default model)`
  }
  return modelFromHealth(health)
}

function RequireAuth() {
  const { cognitoEnabled, ready, authenticated } = useAuthSession()
  const loc = useLocation()
  if (cognitoEnabled && !ready) {
    return <div className="auth-loading-page">Checking sign-in…</div>
  }
  if (cognitoEnabled && !authenticated) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  }
  return <Outlet />
}

export default function App() {
  return (
    <WorkspaceProvider>
      <LlmSettingsProvider>
        <AuthSessionProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route element={<RequireAuth />}>
              <Route path="*" element={<AppWithTranslationBridge />} />
            </Route>
          </Routes>
        </AuthSessionProvider>
      </LlmSettingsProvider>
    </WorkspaceProvider>
  )
}

function AppWithTranslationBridge() {
  const [nav, setNav] = useState<NavId>('studio')
  const goToStudio = useCallback(() => {
    setNav('studio')
  }, [])
  const goToTranslate = useCallback(() => {
    setNav('translate')
  }, [])
  return (
    <TranslationStudioBridgeProvider goToStudio={goToStudio} goToTranslate={goToTranslate}>
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
  const { prefs: llmPrefs } = useLlmSettings()
  const { cognitoEnabled, authenticated, email, signOut } = useAuthSession()
  const { hasPendingTranslation, hasPendingNewsBrief, hasPendingNewsTranslate } = useTranslationStudioBridge()
  const [health, setHealth] = useState<string>('')
  const [banner, setBanner] = useState<string | null>(null)

  const activeCustomerName =
    activeCustomerId && customers.find((c) => c.id === activeCustomerId)?.name

  const loadHealth = useCallback(async () => {
    try {
      const h = await api<{
        ollama_model: string
        ollama_base_url: string
        ollama_image_model?: string
      }>('/api/health')
      const img = h.ollama_image_model?.trim()
      const uiText =
        llmPrefs.textProvider !== 'ollama' || llmPrefs.textModel.trim()
          ? ` · UI texto: ${llmPrefs.textProvider}${llmPrefs.textModel.trim() ? ` (${llmPrefs.textModel.trim()})` : ''}`
          : ''
      const uiImg = llmPrefs.imageModel.trim() ? ` · UI imagem: ${llmPrefs.imageModel.trim()}` : ''
      setHealth(
        `${h.ollama_model} @ ${h.ollama_base_url}${img ? ` · image: ${img}` : ''}${uiText}${uiImg}`,
      )
      setBanner(null)
    } catch (e) {
      setHealth('')
      setBanner(
        e instanceof Error
          ? e.message
          : 'Cannot reach the API. Start the backend on port 8000, then refresh.',
      )
    }
  }, [llmPrefs.imageModel, llmPrefs.textModel, llmPrefs.textProvider])

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
                item.id === 'studio' && (hasPendingTranslation || hasPendingNewsBrief)
                  ? 'shell-link-pending'
                  : item.id === 'translate' && hasPendingNewsTranslate
                    ? 'shell-link-pending'
                    : ''
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
          <span className="aside-hint">
            {llmPrefs.textProvider === 'ollama'
              ? 'Runs in your browser. Text uses local Ollama (Settings).'
              : 'Runs in your browser. Text uses your Settings API provider; images still use local Ollama.'}
          </span>
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
                {statusPillPrimary(health, llmPrefs)}
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
            {cognitoEnabled && authenticated && (
              <>
                {email && (
                  <span className="workspace-pill" title="Signed in with Amazon Cognito">
                    {email}
                  </span>
                )}
                <button type="button" className="btn btn-ghost" onClick={signOut}>
                  Sign out
                </button>
              </>
            )}
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
          {nav === 'news' && <News />}
          {nav === 'settings' && <Settings />}
        </main>

        <footer className="shell-legal">
          GIGI-AI · API <code className="kbd">:8000</code> · UI <code className="kbd">:5173</code> ·
          Configure in <code className="kbd">backend/.env</code>
        </footer>
      </div>
    </div>
  )
}
