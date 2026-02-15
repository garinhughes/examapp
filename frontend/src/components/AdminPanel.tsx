import React, { useEffect, useState, useCallback } from 'react'
import { useAuthFetch } from '../auth/useAuthFetch'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface UserRecord {
  userId: string
  email?: string
  name?: string
  username?: string
  isAdmin?: boolean
  isActive?: boolean
  provider?: string
  lastLogin?: string
  createdAt?: string
}

interface Entitlement {
  userId: string
  productId: string
  kind: string
  purchasedAt: string
  expiresAt: string | null
  status: 'active' | 'cancelled' | 'expired'
  meta?: Record<string, any>
}

interface Product {
  productId: string
  kind: string
  label: string
  description: string
  priceGBP: number
  billingPeriod?: string
  examCodes?: string[]
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const KIND_COLORS: Record<string, string> = {
  exam: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300',
  bundle: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  subscription: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  extra: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  expired: 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/* ------------------------------------------------------------------ */
/*  Sub-component: User Row (expandable)                               */
/* ------------------------------------------------------------------ */

function UserRow({
  user,
  products,
  authFetch,
  onReload,
  onError,
}: {
  user: UserRecord
  products: Product[]
  authFetch: ReturnType<typeof useAuthFetch>
  onReload: () => void
  onError: (msg: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [entitlements, setEntitlements] = useState<Entitlement[]>([])
  const [loadingEnts, setLoadingEnts] = useState(false)
  const [grantProductId, setGrantProductId] = useState('')
  const [granting, setGranting] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)

  const loadEntitlements = useCallback(async () => {
    setLoadingEnts(true)
    try {
      const res = await authFetch(`/admin/users/${encodeURIComponent(user.userId)}/entitlements`)
      if (!res.ok) throw new Error('fetch failed')
      const data = await res.json()
      setEntitlements(Array.isArray(data.entitlements) ? data.entitlements : [])
    } catch {
      onError('Failed to load entitlements')
    } finally {
      setLoadingEnts(false)
    }
  }, [authFetch, user.userId, onError])

  useEffect(() => {
    if (expanded) loadEntitlements()
  }, [expanded, loadEntitlements])

  async function toggleFlag(field: 'isAdmin' | 'isActive', value: boolean) {
    try {
      const res = await authFetch(`/admin/users/${encodeURIComponent(user.userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) throw new Error('update failed')
      onReload()
    } catch {
      onError('Failed to update user')
    }
  }

  async function grantEntitlement() {
    if (!grantProductId) return
    setGranting(true)
    try {
      const res = await authFetch(`/admin/users/${encodeURIComponent(user.userId)}/entitlements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: grantProductId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Grant failed' }))
        throw new Error(err.message)
      }
      setGrantProductId('')
      await loadEntitlements()
    } catch (err: any) {
      onError(err.message || 'Grant failed')
    } finally {
      setGranting(false)
    }
  }

  async function revokeEnt(productId: string) {
    setRevoking(productId)
    try {
      const res = await authFetch(
        `/admin/users/${encodeURIComponent(user.userId)}/entitlements/${encodeURIComponent(productId)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) throw new Error('Revoke failed')
      setConfirmRevoke(null)
      await loadEntitlements()
    } catch (err: any) {
      onError(err.message || 'Revoke failed')
    } finally {
      setRevoking(null)
    }
  }

  const activeEnts = entitlements.filter((e) => e.status === 'active')
  const inactiveEnts = entitlements.filter((e) => e.status !== 'active')
  const alreadyGrantedIds = new Set(activeEnts.map((e) => e.productId))
  const grantableProducts = products.filter((p) => !alreadyGrantedIds.has(p.productId))

  return (
    <>
      {/* Main row */}
      <tr
        className={`border-t border-slate-200/60 dark:border-slate-700/60 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${expanded ? 'bg-slate-50/80 dark:bg-slate-800/30' : ''}`}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="p-2.5">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${user.isActive !== false ? 'bg-emerald-500' : 'bg-red-500'}`} title={user.isActive !== false ? 'Active' : 'Deactivated'} />
            <div>
              <div className="font-medium text-sm">{user.name || '—'}</div>
              {user.username && (
                <div className="text-xs text-sky-500">@{user.username}</div>
              )}
            </div>
          </div>
        </td>
        <td className="p-2.5 text-sm">{user.email || '—'}</td>
        <td className="p-2.5">
          <div className="flex items-center gap-1.5">
            {user.isAdmin && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">ADMIN</span>
            )}
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${user.provider === 'google' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
              {user.provider || 'cognito'}
            </span>
          </div>
        </td>
        <td className="p-2.5 text-xs text-slate-500 dark:text-slate-400">{fmtDateTime(user.lastLogin)}</td>
        <td className="p-2.5 text-right">
          <span className={`text-xs transition-transform inline-block ${expanded ? 'rotate-180' : ''}`}>▼</span>
        </td>
      </tr>

      {/* Expanded detail */}
      {expanded && (
        <tr>
          <td colSpan={5} className="p-0">
            <div className="px-4 py-3 bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-200/60 dark:border-slate-700/60 space-y-4">
              {/* User info & quick actions */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400 font-mono truncate max-w-[260px]" title={user.userId}>ID: {user.userId}</span>
                <div className="flex-1" />
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFlag('isAdmin', !user.isAdmin) }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    user.isAdmin
                      ? 'bg-amber-500 text-white hover:bg-amber-600'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                  }`}
                >
                  {user.isAdmin ? '🛡 Revoke Admin' : '🛡 Make Admin'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFlag('isActive', user.isActive === false ? true : false) }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    user.isActive === false
                      ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
                  }`}
                >
                  {user.isActive === false ? '✓ Activate' : '✗ Deactivate'}
                </button>
              </div>

              {/* Entitlements section */}
              <div>
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Entitlements
                </h4>

                {loadingEnts ? (
                  <div className="text-xs text-slate-400">Loading…</div>
                ) : activeEnts.length === 0 && inactiveEnts.length === 0 ? (
                  <div className="text-xs text-slate-400 italic">No entitlements.</div>
                ) : (
                  <div className="space-y-1.5">
                    {/* Active entitlements */}
                    {activeEnts.map((ent) => {
                      const prod = products.find((p) => p.productId === ent.productId)
                      return (
                        <div key={ent.productId} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900/40">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${KIND_COLORS[ent.kind] ?? 'bg-slate-200 text-slate-600'}`}>
                            {ent.kind}
                          </span>
                          <span className="text-sm font-medium flex-1 truncate">
                            {prod?.label ?? ent.productId}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_COLORS[ent.status]}`}>
                            {ent.status}
                          </span>
                          {ent.meta?.grantedByAdmin && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300">
                              Admin-granted
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400">{fmtDate(ent.purchasedAt)}</span>

                          {/* Revoke button with confirmation */}
                          {confirmRevoke === ent.productId ? (
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => revokeEnt(ent.productId)}
                                disabled={revoking === ent.productId}
                                className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                              >
                                {revoking === ent.productId ? 'Revoking…' : 'Confirm'}
                              </button>
                              <button
                                onClick={() => setConfirmRevoke(null)}
                                className="px-2 py-0.5 rounded text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmRevoke(ent.productId) }}
                              className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      )
                    })}

                    {/* Inactive entitlements (collapsed) */}
                    {inactiveEnts.length > 0 && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 select-none">
                          {inactiveEnts.length} revoked/expired entitlement{inactiveEnts.length !== 1 ? 's' : ''}
                        </summary>
                        <div className="mt-1 space-y-1">
                          {inactiveEnts.map((ent) => {
                            const prod = products.find((p) => p.productId === ent.productId)
                            return (
                              <div key={ent.productId} className="flex items-center gap-2 p-1.5 rounded opacity-60">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${KIND_COLORS[ent.kind] ?? 'bg-slate-200 text-slate-600'}`}>
                                  {ent.kind}
                                </span>
                                <span className="text-sm truncate flex-1">{prod?.label ?? ent.productId}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_COLORS[ent.status]}`}>
                                  {ent.status}
                                </span>
                                <span className="text-[10px] text-slate-400">{fmtDate(ent.purchasedAt)}</span>
                                {/* Re-grant button for revoked/expired */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setGrantProductId(ent.productId)
                                  }}
                                  className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200"
                                >
                                  Re-grant
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </details>
                    )}
                  </div>
                )}

                {/* Grant new entitlement */}
                <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={grantProductId}
                    onChange={(e) => setGrantProductId(e.target.value)}
                    className="flex-1 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  >
                    <option value="">Select product to grant…</option>
                    {grantableProducts.map((p) => (
                      <option key={p.productId} value={p.productId}>
                        {p.label} ({p.kind}) — £{(p.priceGBP / 100).toFixed(2)}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={grantEntitlement}
                    disabled={!grantProductId || granting}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-400 transition-colors"
                  >
                    {granting ? 'Granting…' : '+ Grant'}
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Main AdminPanel                                                    */
/* ------------------------------------------------------------------ */

export default function AdminPanel() {
  const authFetch = useAuthFetch()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState<'all' | 'admin' | 'inactive'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'email' | 'lastLogin'>('lastLogin')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [usersRes, productsRes] = await Promise.all([
        authFetch('/admin/users?limit=200'),
        authFetch('/admin/products'),
      ])
      if (!usersRes.ok) throw new Error('Failed to load users')
      const uData = await usersRes.json()
      setUsers(Array.isArray(uData.users) ? uData.users : [])

      if (productsRes.ok) {
        const pData = await productsRes.json()
        setProducts(Array.isArray(pData.products) ? pData.products : [])
      }
    } catch (err: any) {
      setError(err?.message || 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => { load() }, [load])

  // Filter & sort
  const filtered = users
    .filter((u) => {
      if (filterRole === 'admin' && !u.isAdmin) return false
      if (filterRole === 'inactive' && u.isActive !== false) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          u.email?.toLowerCase().includes(q) ||
          u.name?.toLowerCase().includes(q) ||
          u.username?.toLowerCase().includes(q) ||
          u.userId.toLowerCase().includes(q)
        )
      }
      return true
    })
    .sort((a, b) => {
      let va = '', vb = ''
      if (sortBy === 'name') { va = a.name?.toLowerCase() ?? ''; vb = b.name?.toLowerCase() ?? '' }
      else if (sortBy === 'email') { va = a.email?.toLowerCase() ?? ''; vb = b.email?.toLowerCase() ?? '' }
      else { va = a.lastLogin ?? ''; vb = b.lastLogin ?? '' }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  const sortIcon = (col: typeof sortBy) =>
    sortBy === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Admin Panel</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {users.length} user{users.length !== 1 ? 's' : ''} registered
            {filtered.length !== users.length && ` · ${filtered.length} shown`}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-sm font-medium hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-40 transition-colors"
        >
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline text-xs">dismiss</button>
        </div>
      )}

      {/* Toolbar: search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, username, or ID…"
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40"
          />
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >✕</button>
          )}
        </div>
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded">
          {([['all', 'All'], ['admin', 'Admins'], ['inactive', 'Inactive']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilterRole(val)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${filterRole === val ? 'bg-white dark:bg-slate-600 shadow-sm' : 'text-slate-500'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-auto max-h-[65vh]">
          <table className="w-full table-auto text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10">
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="p-2.5 cursor-pointer hover:text-slate-700 dark:hover:text-slate-200" onClick={() => toggleSort('name')}>
                  User{sortIcon('name')}
                </th>
                <th className="p-2.5 cursor-pointer hover:text-slate-700 dark:hover:text-slate-200" onClick={() => toggleSort('email')}>
                  Email{sortIcon('email')}
                </th>
                <th className="p-2.5">Flags</th>
                <th className="p-2.5 cursor-pointer hover:text-slate-700 dark:hover:text-slate-200" onClick={() => toggleSort('lastLogin')}>
                  Last Login{sortIcon('lastLogin')}
                </th>
                <th className="p-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400">
                    {loading ? 'Loading…' : search ? 'No users match your search.' : 'No users found.'}
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <UserRow
                    key={u.userId}
                    user={u}
                    products={products}
                    authFetch={authFetch}
                    onReload={load}
                    onError={(msg) => setError(msg)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
