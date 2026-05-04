import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { getCognitoEnv } from '../lib/cognitoConfig'
import { completeAuthorizationCodeFlow } from '../lib/cognitoOAuth'
import { runOAuthExchangeOnce } from '../lib/oauthSingleFlight'
import { useAuthSession } from '../context/AuthSessionContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { setStoredPrincipalId } from '../lib/workspaceStorage'
import '../auth.css'

function CallbackError({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="auth-page">
      <div className="auth-card auth-card-narrow">
        <h1 className="auth-title">Sign-in did not complete</h1>
        <p className="auth-lead error-text">{message}</p>
        <button type="button" className="btn primary auth-cta" onClick={onBack}>
          Back to login
        </button>
      </div>
    </div>
  )
}

export default function AuthCallback() {
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const [exchangeErr, setExchangeErr] = useState<string | null>(null)

  const oauthErr = search.get('error_description') || search.get('error')
  if (oauthErr) {
    return <CallbackError message={oauthErr} onBack={() => navigate('/login', { replace: true })} />
  }

  const env = getCognitoEnv()
  if (!env) {
    return <Navigate to="/" replace />
  }

  const code = search.get('code')
  const state = search.get('state')
  if (!code || !state) {
    return (
      <CallbackError
        message="Missing authorization response. Open the app from the login page and sign in again."
        onBack={() => navigate('/login', { replace: true })}
      />
    )
  }

  if (exchangeErr) {
    return <CallbackError message={exchangeErr} onBack={() => navigate('/login', { replace: true })} />
  }

  return <AuthCallbackExchange code={code} state={state} env={env} onError={setExchangeErr} />
}

function AuthCallbackExchange({
  code,
  state,
  env,
  onError,
}: {
  code: string
  state: string
  env: NonNullable<ReturnType<typeof getCognitoEnv>>
  onError: (msg: string) => void
}) {
  const navigate = useNavigate()
  const { setPrincipalId } = useWorkspace()
  const { revalidateSession } = useAuthSession()

  useEffect(() => {
    const flightKey = `${code}:${state}`
    void runOAuthExchangeOnce(flightKey, async () => {
      const session = await completeAuthorizationCodeFlow(env, code, state)
      setPrincipalId(session.principal_sub)
      setStoredPrincipalId(session.principal_sub)
      await revalidateSession()
      navigate('/', { replace: true })
    }).catch((ex: unknown) => {
      onError(ex instanceof Error ? ex.message : 'Sign-in failed')
    })
  }, [code, env, navigate, onError, revalidateSession, setPrincipalId, state])

  return (
    <div className="auth-page">
      <div className="auth-card auth-card-narrow auth-card-quiet">
        <p className="auth-lead" style={{ marginBottom: 0 }}>
          Completing sign-in…
        </p>
      </div>
    </div>
  )
}
