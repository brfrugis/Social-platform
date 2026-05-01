const PRINCIPAL_KEY = 'gigi_principal_id'
const CUSTOMER_KEY = 'gigi_active_customer_id'

export function getStoredPrincipalId(): string {
  try {
    const v = localStorage.getItem(PRINCIPAL_KEY)?.trim()
    return v || 'local-dev'
  } catch {
    return 'local-dev'
  }
}

export function setStoredPrincipalId(value: string): void {
  try {
    const v = value.trim() || 'local-dev'
    localStorage.setItem(PRINCIPAL_KEY, v)
  } catch {
    /* ignore */
  }
}

export function getStoredCustomerId(): string | null {
  try {
    const v = localStorage.getItem(CUSTOMER_KEY)?.trim()
    return v || null
  } catch {
    return null
  }
}

export function setStoredCustomerId(value: string | null): void {
  try {
    if (value) localStorage.setItem(CUSTOMER_KEY, value)
    else localStorage.removeItem(CUSTOMER_KEY)
  } catch {
    /* ignore */
  }
}
