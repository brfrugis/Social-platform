import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useLlmSettings } from '../context/LlmSettingsContext'
import type { LlmUserPrefs, TextProviderId } from '../lib/llmSettingsStorage'

type LlmPublic = {
  ollama_base_url: string
  ollama_default_text: string
  ollama_default_image: string
  ollama_tags: string[]
  ollama_tags_error: string | null
  providers: { id: string; label: string; configured: boolean }[]
}

const PROVIDER_HINTS: Record<TextProviderId, string> = {
  ollama: 'Modelos listados vêm da sua instância Ollama (ollama list / /api/tags).',
  openai:
    'Ex.: gpt-4o-mini, gpt-4o. Chave no servidor (OPENAI_API_KEY) ou abaixo nesta página (teste local — enviada só no pedido HTTP).',
  anthropic:
    'IDs mudam na Anthropic. Ex.: claude-sonnet-4-6, claude-opus-4-6 ou claude-opus-4-7 — confira a lista oficial. Chave no .env ou abaixo.',
  gemini: 'Ex.: gemini-1.5-flash. Chave no servidor (GOOGLE_API_KEY) ou abaixo.',
}

function cloudProviderSelectable(id: string, serverConfigured: boolean, draft: LlmUserPrefs): boolean {
  if (id === 'ollama') return true
  if (id === 'openai') return serverConfigured || !!draft.openaiApiKey.trim()
  if (id === 'anthropic') return serverConfigured || !!draft.anthropicApiKey.trim()
  if (id === 'gemini') return serverConfigured || !!draft.googleApiKey.trim()
  return false
}

export default function Settings() {
  const { prefs, setPrefs, resetPrefs } = useLlmSettings()
  const [draft, setDraft] = useState<LlmUserPrefs>(prefs)
  const [publicLlm, setPublicLlm] = useState<LlmPublic | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  useEffect(() => {
    setDraft(prefs)
  }, [prefs])

  const reloadPublic = useCallback(async () => {
    setLoadErr(null)
    try {
      const p = await api<LlmPublic>('/api/llm/settings-public')
      setPublicLlm(p)
    } catch (e) {
      setPublicLlm(null)
      setLoadErr(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void reloadPublic()
  }, [reloadPublic])

  const save = () => {
    setPrefs(draft)
    setSavedMsg('Preferências salvas neste navegador.')
    window.setTimeout(() => setSavedMsg(null), 3500)
  }

  const selectedProvider = publicLlm?.providers.find((x) => x.id === draft.textProvider)

  return (
    <div className="page-stack">
      <p className="translate-lead">
        Escolha o <strong>modelo de texto</strong> (Ollama local ou APIs na nuvem) e o <strong>modelo de imagem</strong>{' '}
        Ollama para o Studio. Preferências de modelo ficam em <code className="kbd">localStorage</code>. Para OpenAI /
        Anthropic / Gemini pode usar <code className="kbd">backend/.env</code> <strong>ou</strong> as chaves opcionais
        abaixo (guardadas neste navegador e enviadas como cabeçalhos HTTP só nas chamadas de texto — adequado para teste
        local; não use em máquinas partilhadas).
      </p>

      {loadErr && (
        <div className="banner banner-inline error" role="status">
          {loadErr}
        </div>
      )}

      {savedMsg && (
        <div className="banner soft" role="status">
          {savedMsg}
        </div>
      )}

      <section className="step-card">
        <div className="step-head">
          <span className="step-num">1</span>
          <div>
            <h2 className="step-title">Provedor de texto</h2>
            <p className="step-desc">Usado em Studio (geração e sugestão de prompt de imagem) e em Translate.</p>
          </div>
        </div>

        <label className="field full">
          <span>Provedor</span>
          <select
            className="input"
            value={draft.textProvider}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                textProvider: e.target.value as TextProviderId,
              }))
            }
          >
            {(publicLlm?.providers ?? [
              { id: 'ollama', label: 'Ollama (local)', configured: true },
              { id: 'openai', label: 'OpenAI', configured: false },
              { id: 'anthropic', label: 'Anthropic Claude', configured: false },
              { id: 'gemini', label: 'Google Gemini', configured: false },
            ]).map((p) => (
              <option
                key={p.id}
                value={p.id}
                disabled={!cloudProviderSelectable(p.id, p.configured, draft)}
              >
                {p.label}
                {!cloudProviderSelectable(p.id, p.configured, draft) && p.id !== 'ollama'
                  ? ' (defina chave no servidor ou abaixo)'
                  : ''}
              </option>
            ))}
          </select>
        </label>

        <p className="hint small muted" style={{ marginTop: '-0.25rem' }}>
          {PROVIDER_HINTS[draft.textProvider]}
        </p>

        {draft.textProvider === 'ollama' && publicLlm && (
          <label className="field full">
            <span>Modelo Ollama (tag)</span>
            <select
              className="input"
              value={draft.textModel}
              onChange={(e) => setDraft((d) => ({ ...d, textModel: e.target.value }))}
            >
              <option value="">Padrão do servidor ({publicLlm.ollama_default_text})</option>
              {publicLlm.ollama_tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
            {publicLlm.ollama_tags_error && (
              <span className="hint small" style={{ color: 'var(--text-muted)' }}>
                Lista de modelos: {publicLlm.ollama_tags_error}
              </span>
            )}
          </label>
        )}

        {draft.textProvider !== 'ollama' && (
          <label className="field full">
            <span>ID do modelo</span>
            <input
              className="input"
              value={draft.textModel}
              onChange={(e) => setDraft((d) => ({ ...d, textModel: e.target.value }))}
              placeholder={
                draft.textProvider === 'openai'
                  ? 'gpt-4o-mini'
                  : draft.textProvider === 'anthropic'
                    ? 'claude-sonnet-4-6'
                    : 'gemini-1.5-flash'
              }
              autoComplete="off"
            />
          </label>
        )}

        {draft.textProvider === 'ollama' && publicLlm && (
          <p className="hint small muted" style={{ marginBottom: 0 }}>
            Base Ollama: <code className="kbd">{publicLlm.ollama_base_url}</code> — igual ao{' '}
            <code className="kbd">OLLAMA_BASE_URL</code> do backend.
          </p>
        )}

        {draft.textProvider !== 'ollama' &&
          !cloudProviderSelectable(draft.textProvider, selectedProvider?.configured ?? false, draft) && (
            <p className="hint small" style={{ marginBottom: 0 }}>
              Defina a chave deste provedor no <code className="kbd">backend/.env</code> ou na secção abaixo, depois
              guarde as preferências.
            </p>
          )}
      </section>

      <section className="step-card">
        <div className="step-head">
          <span className="step-num">1b</span>
          <div>
            <h2 className="step-title">Chaves API (opcional — teste)</h2>
            <p className="step-desc">
              Preencha só o que for usar. O backend prefere estes valores aos do <code className="kbd">.env</code> quando o
              cabeçalho é enviado. Limpe e guarde para voltar a usar só o servidor.
            </p>
          </div>
        </div>
        <div className="form-grid">
          <label className="field full">
            <span>OpenAI API key</span>
            <input
              className="input"
              type="password"
              autoComplete="off"
              value={draft.openaiApiKey}
              onChange={(e) => setDraft((d) => ({ ...d, openaiApiKey: e.target.value }))}
              placeholder="sk-… (não é guardada no servidor)"
            />
          </label>
          <label className="field full">
            <span>Anthropic API key</span>
            <input
              className="input"
              type="password"
              autoComplete="off"
              value={draft.anthropicApiKey}
              onChange={(e) => setDraft((d) => ({ ...d, anthropicApiKey: e.target.value }))}
              placeholder="sk-ant-…"
            />
          </label>
          <label className="field full">
            <span>Google AI (Gemini) API key</span>
            <input
              className="input"
              type="password"
              autoComplete="off"
              value={draft.googleApiKey}
              onChange={(e) => setDraft((d) => ({ ...d, googleApiKey: e.target.value }))}
              placeholder="Opcional — mesmo fluxo que GOOGLE_API_KEY"
            />
          </label>
        </div>
        <p className="hint small muted" style={{ marginBottom: 0 }}>
          Cabeçalhos: <code className="kbd">X-Gigi-OpenAI-Key</code>, <code className="kbd">X-Gigi-Anthropic-Key</code>,{' '}
          <code className="kbd">X-Gigi-Google-Key</code>. Risco XSS se extensões maliciosas acederem ao armazenamento do
          browser — prefira <code className="kbd">.env</code> em produção.
        </p>
      </section>

      <section className="step-card">
        <div className="step-head">
          <span className="step-num">2</span>
          <div>
            <h2 className="step-title">Modelo de imagem (Ollama)</h2>
            <p className="step-desc">Apenas para <strong>Gerar imagem</strong> no Studio (<code>/api/generate</code>).</p>
          </div>
        </div>

        {publicLlm && (
          <label className="field full">
            <span>Tag do modelo de imagem</span>
            <select
              className="input"
              value={draft.imageModel}
              onChange={(e) => setDraft((d) => ({ ...d, imageModel: e.target.value }))}
            >
              <option value="">Padrão do servidor ({publicLlm.ollama_default_image})</option>
              {publicLlm.ollama_tags.map((tag) => (
                <option key={`img-${tag}`} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
        )}

        <p className="hint small muted" style={{ marginBottom: 0 }}>
          Modelos de texto e de imagem podem ser tags diferentes na Ollama. Consulte{' '}
          <a href="https://github.com/ollama/ollama/blob/main/docs/api.md" target="_blank" rel="noreferrer">
            documentação Ollama
          </a>{' '}
          e <code className="kbd">docs/IMAGE_GENERATION.md</code> no repositório.
        </p>
      </section>

      <div className="row actions">
        <button type="button" className="btn primary" onClick={save}>
          Salvar preferências
        </button>
        <button type="button" className="btn secondary" onClick={() => void reloadPublic()}>
          Recarregar modelos Ollama
        </button>
        <button type="button" className="btn btn-ghost" onClick={resetPrefs}>
          Restaurar padrões
        </button>
      </div>
    </div>
  )
}
