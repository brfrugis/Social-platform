import { useCallback, useEffect, useState } from 'react'
import { api } from './lib/api'
import Studio from './pages/Studio'
import Translate from './pages/Translate'
import Templates from './pages/Templates'
import Library from './pages/Library'
import './App.css'

export type NavId = 'studio' | 'translate' | 'templates' | 'library'

const NAV: { id: NavId; label: string; hint: string }[] = [
  { id: 'studio', label: 'Studio', hint: 'Brief, guardrails, formats, output' },
  { id: 'translate', label: 'Translate', hint: 'English or Spanish to pt-BR' },
  { id: 'templates', label: 'Templates', hint: 'Ingest guardrails and structure' },
  { id: 'library', label: 'Formats and tones', hint: 'JSON presets' },
]

export default function App() {
  const [nav, setNav] = useState<NavId>('studio')
  const [health, setHealth] = useState<string>('')
  const [banner, setBanner] = useState<string | null>(null)

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
          : 'API unreachable. Start the backend on port 8000.',
      )
    }
  }, [])

  useEffect(() => {
    void loadHealth()
  }, [loadHealth])

  return (
    <div className="app-shell">
      <aside className="shell-aside" aria-label="Primary">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <div>
            <div className="brand-title">GIGI-AI</div>
            <div className="brand-sub">Create · translate · guardrails</div>
          </div>
        </div>
        <nav className="shell-nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`shell-link ${nav === item.id ? 'active' : ''}`}
              onClick={() => setNav(item.id)}
            >
              <span className="shell-link-label">{item.label}</span>
              <span className="shell-link-hint">{item.hint}</span>
            </button>
          ))}
        </nav>
        <div className="shell-footer">
          <button type="button" className="btn secondary small block-btn" onClick={() => void loadHealth()}>
            Refresh status
          </button>
          {health ? <div className="health-line">{health}</div> : null}
        </div>
      </aside>

      <div className="shell-body">
        <header className="shell-header">
          <div>
            <h1 className="shell-page-title">
              {NAV.find((n) => n.id === nav)?.label ?? 'Studio'}
            </h1>
            <p className="shell-page-sub">{NAV.find((n) => n.id === nav)?.hint}</p>
          </div>
        </header>

        {banner && (
          <div className="banner error" role="status">
            {banner}
          </div>
        )}

        <main className="shell-content">
          {nav === 'studio' && <Studio />}
          {nav === 'translate' && <Translate />}
          {nav === 'templates' && <Templates />}
          {nav === 'library' && <Library />}
        </main>

        <footer className="shell-legal">
          GIGI-AI — model and paths in <code>backend/.env</code>. API port 8000, UI port 5173.
        </footer>
      </div>
    </div>
  )
}
