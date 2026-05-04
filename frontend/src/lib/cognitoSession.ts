import { getStoredPrincipalId } from './workspaceStorage'

const SESSION_KEY = 'gigi_cognito_oidc_session'
const PKCE_PENDING_KEY = 'gigi_cognito_pkce_pending'

export type CognitoPkcePending = {
  state: string
  code_verifier: string
  created_at_ms: number
}

export type CognitoStoredSession = {
  access_token: string
  id_token: string
  refresh_token: string | null
  /** Wall-clock when access_token should be refreshed (client-side heuristic). */
  expires_at_ms: number
  principal_sub: string
  email: string | null
}

export function readPkcePending(): CognitoPkcePending | null {
  try {
    const raw = sessionStorage.getItem(PKCE_PENDING_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as CognitoPkcePending
    if (!o.state || !o.code_verifier) return null
    if (Date.now() - o.created_at_ms > 10 * 60 * 1000) {
      sessionStorage.removeItem(PKCE_PENDING_KEY)
      return null
    }
    return o
  } catch {
    return null
  }
}

export function writePkcePending(p: CognitoPkcePending): void {
  sessionStorage.setItem(PKCE_PENDING_KEY, JSON.stringify(p))
}

export function clearPkcePending(): void {
  sessionStorage.removeItem(PKCE_PENDING_KEY)
}

export function readStoredSession(): CognitoStoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as CognitoStoredSession
    if (!o.access_token || !o.id_token || !o.principal_sub) return null
    return o
  } catch {
    return null
  }
}

export function writeStoredSession(s: CognitoStoredSession): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
}

export function clearStoredSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
}

export type IdTokenClaims = {
  sub: string
  email?: string
  exp?: number
  aud?: string
  iss?: string
}

export function decodeJwtPayload<T extends IdTokenClaims>(jwt: string): T {
  const parts = jwt.split('.')
  if (parts.length < 2) throw new Error('Invalid JWT shape')
  const payload = parts[1]
  if (!payload) throw new Error('Invalid JWT')
  const padded = payload.replace(/-/g, '+').replace(/_/g, '/')
  const padLen = (4 - (padded.length % 4)) % 4
  const json = atob(padded + '='.repeat(padLen))
  return JSON.parse(json) as T
}

/** Principal for X-Principal-Id: prefer Cognito sub when a session row exists. */
export function resolvePrincipalIdForApp(): string {
  const row = readStoredSession()
  if (row?.principal_sub) return row.principal_sub
  return getStoredPrincipalId()
}
