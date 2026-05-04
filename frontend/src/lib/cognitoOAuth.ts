import type { CognitoEnv } from './cognitoConfig'
import {
  clearPkcePending,
  decodeJwtPayload,
  readPkcePending,
  type CognitoStoredSession,
  writePkcePending,
  writeStoredSession,
} from './cognitoSession'
import { randomCodeVerifier, randomOAuthState, sha256Base64Url } from './cognitoPkce'

const SCOPES = 'openid email profile'

type TokenSuccess = {
  access_token: string
  id_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

type TokenErrorBody = { error?: string; error_description?: string }

function formBody(params: Record<string, string>): string {
  return new URLSearchParams(params).toString()
}

async function postToken(env: CognitoEnv, body: string): Promise<TokenSuccess> {
  const url = `${env.domain}/oauth2/token`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const text = await res.text()
  let data: TokenSuccess & TokenErrorBody
  try {
    data = JSON.parse(text) as TokenSuccess & TokenErrorBody
  } catch {
    throw new Error(`Token endpoint returned non-JSON (${res.status})`)
  }
  if (!res.ok || data.error) {
    const msg = data.error_description || data.error || text.slice(0, 200)
    throw new Error(msg || `Token request failed (${res.status})`)
  }
  if (!data.access_token || !data.id_token) {
    throw new Error('Token response missing access_token or id_token')
  }
  return data as TokenSuccess
}

export function persistTokensAsSession(t: TokenSuccess): CognitoStoredSession {
  const claims = decodeJwtPayload(t.id_token)
  if (!claims.sub) throw new Error('ID token missing sub')
  const skewMs = 60_000
  const expires_at_ms = Date.now() + Math.max(30, t.expires_in) * 1000 - skewMs
  const row: CognitoStoredSession = {
    access_token: t.access_token,
    id_token: t.id_token,
    refresh_token: t.refresh_token ?? null,
    expires_at_ms,
    principal_sub: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
  }
  writeStoredSession(row)
  return row
}

export async function refreshAccessToken(env: CognitoEnv, refresh_token: string): Promise<CognitoStoredSession> {
  const t = await postToken(
    env,
    formBody({
      grant_type: 'refresh_token',
      client_id: env.clientId,
      refresh_token,
    }),
  )
  return persistTokensAsSession({
    ...t,
    refresh_token: t.refresh_token || refresh_token,
  })
}

/** Start Hosted UI (or native sign-in) with PKCE; redirects away from the app. */
export async function beginHostedUiSignIn(env: CognitoEnv): Promise<void> {
  const code_verifier = randomCodeVerifier()
  const code_challenge = await sha256Base64Url(code_verifier)
  const state = randomOAuthState()
  writePkcePending({ state, code_verifier, created_at_ms: Date.now() })

  const u = new URL(`${env.domain}/oauth2/authorize`)
  u.searchParams.set('client_id', env.clientId)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', SCOPES)
  u.searchParams.set('redirect_uri', env.redirectUri)
  u.searchParams.set('state', state)
  u.searchParams.set('code_challenge_method', 'S256')
  u.searchParams.set('code_challenge', code_challenge)
  window.location.assign(u.toString())
}

export async function completeAuthorizationCodeFlow(
  env: CognitoEnv,
  code: string,
  returnedState: string,
): Promise<CognitoStoredSession> {
  const pending = readPkcePending()
  if (!pending) throw new Error('PKCE session expired. Start sign-in again from the login page.')
  if (pending.state !== returnedState) throw new Error('Invalid OAuth state (possible CSRF). Try signing in again.')
  const t = await postToken(
    env,
    formBody({
      grant_type: 'authorization_code',
      client_id: env.clientId,
      code,
      redirect_uri: env.redirectUri,
      code_verifier: pending.code_verifier,
    }),
  )
  clearPkcePending()
  return persistTokensAsSession(t)
}

export function buildCognitoLogoutUrl(env: CognitoEnv): string {
  const u = new URL(`${env.domain}/logout`)
  u.searchParams.set('client_id', env.clientId)
  u.searchParams.set('logout_uri', env.logoutUri)
  return u.toString()
}
