import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { tenantApi } from '../lib/tenantApi'
import {
  getStoredCustomerId,
  getStoredPrincipalId,
  setStoredCustomerId,
  setStoredPrincipalId,
} from '../lib/workspaceStorage'

export type CustomerRow = {
  id: string
  name: string
  slug: string | null
  created_at: string
}

type WorkspaceCtx = {
  principalId: string
  setPrincipalId: (v: string) => void
  activeCustomerId: string | null
  setActiveCustomerId: (v: string | null) => void
  customers: CustomerRow[]
  refreshCustomers: () => Promise<void>
  /** null = not checked yet; false = DB / tenant API unreachable */
  tenantsOk: boolean | null
  /** Last error from /api/tenants/db-health or customer list (when tenantsOk is false) */
  tenantsNotice: string | null
}

const Ctx = createContext<WorkspaceCtx | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [principalId, setPrincipalIdState] = useState(getStoredPrincipalId)
  const [activeCustomerId, setActiveCustomerIdState] = useState<string | null>(getStoredCustomerId)
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [tenantsOk, setTenantsOk] = useState<boolean | null>(null)
  const [tenantsNotice, setTenantsNotice] = useState<string | null>(null)

  const setPrincipalId = useCallback((v: string) => {
    const next = v.trim() || 'local-dev'
    setPrincipalIdState(next)
    setStoredPrincipalId(next)
  }, [])

  const setActiveCustomerId = useCallback((v: string | null) => {
    setActiveCustomerIdState(v)
    setStoredCustomerId(v)
  }, [])

  const refreshCustomers = useCallback(async () => {
    const pid = principalId.trim() || 'local-dev'
    try {
      setTenantsNotice(null)
      await tenantApi(pid, '/api/tenants/db-health')
      setTenantsOk(true)
      const list = await tenantApi<CustomerRow[]>(pid, '/api/tenants/customers')
      setCustomers(list)
      setActiveCustomerIdState((cur) => {
        if (!cur) return cur
        if (list.some((c) => c.id === cur)) return cur
        setStoredCustomerId(null)
        return null
      })
    } catch (e) {
      setTenantsOk(false)
      setCustomers([])
      setTenantsNotice(e instanceof Error ? e.message : 'Tenant API request failed')
    }
  }, [principalId])

  useEffect(() => {
    void refreshCustomers()
  }, [refreshCustomers])

  const value = useMemo(
    () => ({
      principalId,
      setPrincipalId,
      activeCustomerId,
      setActiveCustomerId,
      customers,
      refreshCustomers,
      tenantsOk,
      tenantsNotice,
    }),
    [
      principalId,
      setPrincipalId,
      activeCustomerId,
      setActiveCustomerId,
      customers,
      refreshCustomers,
      tenantsOk,
      tenantsNotice,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWorkspace(): WorkspaceCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return v
}
