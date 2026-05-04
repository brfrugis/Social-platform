import { Navigate } from 'react-router-dom'
import { cognitoAuthRequired, getCognitoEnv } from '../lib/cognitoConfig'
import { useAuthSession } from '../context/AuthSessionContext'
import '../auth.css'

export default function Login() {
  const { ready, authenticated, signInWithRedirect } = useAuthSession()
  const env = getCognitoEnv()

  if (!cognitoAuthRequired()) {
    return <Navigate to="/" replace />
  }

  if (!ready) {
    return (
      <div className="auth-page">
        <div className="auth-card auth-card-narrow auth-card-quiet">
          <p className="auth-lead" style={{ marginBottom: 0 }}>
            Checking session…
          </p>
        </div>
      </div>
    )
  }

  if (authenticated) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-mark" aria-hidden />
          <div>
            <div className="auth-brand-title">GIGI-AI</div>
            <div className="auth-brand-sub">Secure sign-in</div>
          </div>
        </div>

        <h1 className="auth-title">Sign in to continue</h1>
        <p className="auth-lead">
          This environment uses <strong>Amazon Cognito</strong> as the identity provider. You are redirected to
          Cognito&apos;s hosted sign-in over HTTPS, then returned here — no password is collected on this page.
        </p>

        <ul className="auth-list">
          <li>
            <strong>PKCE</strong> protects the authorization code flow (recommended for browser apps).
          </li>
          <li>
            <strong>Session tokens</strong> are kept in <code className="kbd">sessionStorage</code> for this tab
            only; closing the tab ends the local session (you may still have a Cognito cookie until federated logout).
          </li>
          <li>
            <strong>API access</strong> still uses <code className="kbd">X-Principal-Id</code> set to your Cognito{' '}
            <code className="kbd">sub</code> after sign-in. Validate JWTs on the server when you add protected APIs.
          </li>
        </ul>

        <button type="button" className="btn primary auth-cta" onClick={() => void signInWithRedirect()}>
          Continue with Cognito
        </button>

        {env && (
          <p className="auth-hint muted small">
            Callback URL must include <code className="kbd">{env.redirectUri}</code> in the app client settings.
          </p>
        )}
      </div>
    </div>
  )
}
