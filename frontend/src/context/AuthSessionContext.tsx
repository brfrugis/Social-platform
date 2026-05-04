import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { getCognitoEnv } from '../lib/cognitoConfig'
import { beginHostedUiSignIn, buildCognitoLogoutUrl, refreshAccessToken } from '../lib/cognitoOAuth'
import { clearStoredSession, readStoredSession } from '../lib/cognitoSession'
import { useWorkspace } from './WorkspaceContext'
import { setStoredPrincipalId } from '../lib/workspaceStorage'

type AuthSessionCtx = {
  cognitoEnabled: boolean
  /** False until first Cognito session check (or refresh) finishes when Cognito is enabled. */
  ready: boolean
  authenticated: boolean
  email: string | null
  signInWithRedirect: () => Promise<void>
  /** Re-read tokens from storage (call after OAuth callback writes the session). */
  revalidateSession: () => Promise<void>
  signOut: () => void
}

const Ctx = createContext<AuthSessionCtx | null>(null)

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const env = useMemo(() => getCognitoEnv(), [])
  const cognitoEnabled = env !== null
  const [ready, setReady] = useState(!cognitoEnabled)
  const [authenticated, setAuthenticated] = useState(!cognitoEnabled)
  const [email, setEmail] = useState<string | null>(null)
  const { setPrincipalId, setActiveCustomerId } = useWorkspace()
  const navigate = useNavigate()

  const reconcileCognitoSession = useCallback(async () => {
    if (!env) {
      setAuthenticated(false)
      setEmail(null)
      return
    }
    const s = readStoredSession()
    if (!s) {
      setAuthenticated(false)
      setEmail(null)
      return
    }
    setEmail(s.email)
    if (Date.now() < s.expires_at_ms) {
      setPrincipalId(s.principal_sub)
      setStoredPrincipalId(s.principal_sub)
      setAuthenticated(true)
      return
    }
    if (s.refresh_token) {
      try {
        const next = await refreshAccessToken(env, s.refresh_token)
        setPrincipalId(next.principal_sub)
        setStoredPrincipalId(next.principal_sub)
        setEmail(next.email)
        setAuthenticated(true)
      } catch {
        clearStoredSession()
        setAuthenticated(false)
        setEmail(null)
      }
      return
    }
    clearStoredSession()
    setAuthenticated(false)
    setEmail(null)
  }, [env, setPrincipalId])

  const revalidateSession = useCallback(async () => {
    if (!env) return
    await reconcileCognitoSession()
  }, [env, reconcileCognitoSession])

  useEffect(() => {
    if (!cognitoEnabled) return
    let cancelled = false
    void (async () => {
      await reconcileCognitoSession()
      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [cognitoEnabled, reconcileCognitoSession])

  const signInWithRedirect = useCallback(async () => {
    const e = getCognitoEnv()
    if (!e) return
    await beginHostedUiSignIn(e)
  }, [])

  const signOut = useCallback(() => {
    const e = getCognitoEnv()
    clearStoredSession()
    setPrincipalId('local-dev')
    setStoredPrincipalId('local-dev')
    setActiveCustomerId(null)
    setAuthenticated(false)
    setEmail(null)
    if (e) {
      window.location.assign(buildCognitoLogoutUrl(e))
      return
    }
    navigate('/login', { replace: true })
  }, [navigate, setActiveCustomerId, setPrincipalId])

  const value = useMemo(
    () => ({
      cognitoEnabled,
      ready,
      authenticated,
      email,
      signInWithRedirect,
      revalidateSession,
      signOut,
    }),
    [cognitoEnabled, ready, authenticated, email, signInWithRedirect, revalidateSession, signOut],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuthSession(): AuthSessionCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuthSession must be used within AuthSessionProvider')
  return v
}
