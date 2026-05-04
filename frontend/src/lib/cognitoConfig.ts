/**
 * When all required vars are set, the UI requires Amazon Cognito (OAuth 2.0 + PKCE).
 * Configure the User Pool app client as a public SPA client (no secret); enable PKCE.
 */

export type CognitoEnv = {
  region: string
  userPoolId: string
  /** e.g. https://your-prefix.auth.us-east-1.amazoncognito.com (no trailing slash) */
  domain: string
  clientId: string
  redirectUri: string
  logoutUri: string
}

function runtimeOrigin(): string {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}

export function getCognitoEnv(): CognitoEnv | null {
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID?.trim()
  if (!clientId) return null

  const domain = import.meta.env.VITE_COGNITO_DOMAIN?.trim().replace(/\/$/, '')
  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID?.trim()
  const region = import.meta.env.VITE_COGNITO_REGION?.trim()
  if (!domain || !userPoolId || !region) {
    console.warn(
      'Cognito: VITE_COGNITO_CLIENT_ID is set but VITE_COGNITO_DOMAIN, VITE_COGNITO_USER_POOL_ID, or VITE_COGNITO_REGION is missing.',
    )
    return null
  }

  const origin = runtimeOrigin()
  const redirectUri =
    import.meta.env.VITE_COGNITO_REDIRECT_URI?.trim() || (origin ? `${origin}/auth/callback` : '')
  const logoutUri = import.meta.env.VITE_COGNITO_LOGOUT_URI?.trim() || (origin ? `${origin}/login` : '')

  if (!redirectUri || !logoutUri) {
    return null
  }

  return { region, userPoolId, domain, clientId, redirectUri, logoutUri }
}

export function cognitoAuthRequired(): boolean {
  return getCognitoEnv() !== null
}
