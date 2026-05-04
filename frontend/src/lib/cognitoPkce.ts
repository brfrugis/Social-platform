function base64urlFromBytes(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function sha256Base64Url(ascii: string): Promise<string> {
  const data = new TextEncoder().encode(ascii)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return base64urlFromBytes(new Uint8Array(hash))
}

/** RFC 7636: 43–128 characters from [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~" */
export function randomCodeVerifier(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64urlFromBytes(bytes)
}

export function randomOAuthState(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return base64urlFromBytes(bytes)
}
