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
  available?: boolean
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const KIND_COLORS: Record<string, string> = {
  exam: 'bg-primary/10 text-primary',
  bundle: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  subscription: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  extra: 'bg-primary/10 text-primary',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  expired: 'bg-accent text-muted-foreground',
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
  const grantableProducts = products.filter((p) => !alreadyGrantedIds.has(p.productId) && p.available !== false)

  return (
    <>
      {/* Main row */}
      <tr
        className={`border-t border-border/60 dark:border-border/60 cursor-pointer hover:bg-muted/50 dark:hover:bg-card/40 transition-colors ${expanded ? 'bg-muted/50/80 dark:bg-card/30' : ''}`}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="p-2.5">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${user.isActive !== false ? 'bg-emerald-500' : 'bg-red-500'}`} title={user.isActive !== false ? 'Active' : 'Deactivated'} />
            <div>
              <div className="font-medium text-sm">{user.name || '—'}</div>
              {user.username && (
                <div className="text-xs text-primary">@{user.username}</div>
              )}
            </div>
          </div>
        </td>
        <td className="p-2.5 text-sm">{user.email || '—'}</td>
        <td className="p-2.5">
          <div className="flex items-center gap-1.5">
            {user.isAdmin && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary">ADMIN</span>
            )}
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${user.provider === 'google' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300' : 'bg-muted text-muted-foreground'}`}>
              {user.provider || 'cognito'}
            </span>
          </div>
        </td>
        <td className="p-2.5 text-xs text-muted-foreground">{fmtDateTime(user.lastLogin)}</td>
        <td className="p-2.5 text-right">
          <span className={`text-xs transition-transform inline-block ${expanded ? 'rotate-180' : ''}`}>▼</span>
        </td>
      </tr>

      {/* Expanded detail */}
      {expanded && (
        <tr>
          <td colSpan={5} className="p-0">
            <div className="px-4 py-3 bg-muted/50/50 dark:bg-card/20 border-b border-border/60 dark:border-border/60 space-y-4">
              {/* User info & quick actions */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground font-mono truncate max-w-[260px]" title={user.userId}>ID: {user.userId}</span>
                <div className="flex-1" />
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFlag('isAdmin', !user.isAdmin) }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    user.isAdmin
                      ? 'bg-primary/100 text-white hover:bg-primary'
                      : 'bg-accent text-muted-foreground hover:bg-accent'
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
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Entitlements
                </h4>

                {loadingEnts ? (
                  <div className="text-xs text-muted-foreground">Loading…</div>
                ) : activeEnts.length === 0 && inactiveEnts.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic">No entitlements.</div>
                ) : (
                  <div className="space-y-1.5">
                    {/* Active entitlements */}
                    {activeEnts.map((ent) => {
                      const prod = products.find((p) => p.productId === ent.productId)
                      return (
                        <div key={ent.productId} className="flex items-center gap-2 p-2 rounded-lg border border-border/60 dark:border-border/60 bg-card/40">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${KIND_COLORS[ent.kind] ?? 'bg-accent text-muted-foreground'}`}>
                            {ent.kind}
                          </span>
                          <span className="text-sm font-medium flex-1 truncate">
                            {prod?.label ?? ent.productId}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_COLORS[ent.status]}`}>
                            {ent.status}
                          </span>
                          {ent.meta?.grantedByAdmin && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary/10 dark:bg-primary/10 text-primary dark:text-primary">
                              Admin-granted
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground">{fmtDate(ent.purchasedAt)}</span>

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
                                className="px-2 py-0.5 rounded text-[10px] bg-accent text-muted-foreground"
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
                        <summary className="cursor-pointer text-muted-foreground hover:text-muted-foreground dark:hover:text-muted-foreground select-none">
                          {inactiveEnts.length} revoked/expired entitlement{inactiveEnts.length !== 1 ? 's' : ''}
                        </summary>
                        <div className="mt-1 space-y-1">
                          {inactiveEnts.map((ent) => {
                            const prod = products.find((p) => p.productId === ent.productId)
                            return (
                              <div key={ent.productId} className="flex items-center gap-2 p-1.5 rounded opacity-60">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${KIND_COLORS[ent.kind] ?? 'bg-accent text-muted-foreground'}`}>
                                  {ent.kind}
                                </span>
                                <span className="text-sm truncate flex-1">{prod?.label ?? ent.productId}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_COLORS[ent.status]}`}>
                                  {ent.status}
                                </span>
                                <span className="text-[10px] text-muted-foreground">{fmtDate(ent.purchasedAt)}</span>
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
                    className="flex-1 px-2 py-1.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
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
/*  Sub-component: Bulk Exam Migration                                 */
/* ------------------------------------------------------------------ */

interface ExamEntry { code: string; title: string; provider: string | null }
interface MigrateUser { userId: string; status: 'granted' | 'skipped' }
interface MigrateResult { grantedCount: number; skippedCount: number; dryRun: boolean; users: MigrateUser[] }

function BulkMigratePanel({
  authFetch,
}: {
  authFetch: ReturnType<typeof useAuthFetch>
}) {
  const [open, setOpen] = useState(false)
  const [exams, setExams] = useState<ExamEntry[]>([])
  const [loadingExams, setLoadingExams] = useState(false)
  const [fromCode, setFromCode] = useState('')
  const [toCode, setToCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<MigrateResult | null>(null)
  const [result, setResult] = useState<MigrateResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    if (!open || exams.length > 0) return
    setLoadingExams(true)
    authFetch('/admin/exams')
      .then((r) => r.json())
      .then((d) => setExams(Array.isArray(d.exams) ? d.exams : []))
      .catch(() => setErr('Failed to load exams'))
      .finally(() => setLoadingExams(false))
  }, [open, authFetch, exams.length])

  async function runMigrate(dryRun: boolean) {
    setErr(null)
    setBusy(true)
    try {
      const res = await authFetch('/admin/bulk-migrate-entitlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromProductId: `exam:${fromCode}`, toProductId: `exam:${toCode}`, dryRun }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Request failed')
      if (dryRun) {
        setPreview(data)
        setConfirm(false)
      } else {
        setResult(data)
        setPreview(null)
        setConfirm(false)
      }
    } catch (e: any) {
      setErr(e.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setPreview(null)
    setResult(null)
    setConfirm(false)
    setErr(null)
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-muted text-sm font-semibold hover:bg-muted/80 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span>Exam Version Migration</span>
        <span className={`text-xs transition-transform inline-block ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div className="p-4 space-y-4 bg-card">
          <p className="text-xs text-muted-foreground">
            Bulk-grant a new exam version to all users who actively purchased an older version.
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1 min-w-[200px] flex-1">
              <label className="text-xs font-medium text-muted-foreground">From (old exam)</label>
              <select
                value={fromCode}
                onChange={(e) => { setFromCode(e.target.value); reset() }}
                disabled={loadingExams}
                className="px-2 py-1.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
              >
                <option value="">{loadingExams ? 'Loading…' : 'Select exam…'}</option>
                {exams.map((e) => (
                  <option key={e.code} value={e.code}>{e.code} — {e.title}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1 min-w-[200px] flex-1">
              <label className="text-xs font-medium text-muted-foreground">To (new exam)</label>
              <select
                value={toCode}
                onChange={(e) => { setToCode(e.target.value); reset() }}
                disabled={loadingExams}
                className="px-2 py-1.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
              >
                <option value="">{loadingExams ? 'Loading…' : 'Select exam…'}</option>
                {exams.filter((e) => e.code !== fromCode).map((e) => (
                  <option key={e.code} value={e.code}>{e.code} — {e.title}</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => { reset(); runMigrate(true) }}
              disabled={!fromCode || !toCode || busy || loadingExams}
              className="px-3 py-1.5 rounded-lg bg-accent text-sm font-medium hover:bg-accent disabled:opacity-40 transition-colors"
            >
              {busy && !confirm ? 'Loading…' : 'Preview'}
            </button>
          </div>

          {err && (
            <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
              {err}
            </div>
          )}

          {/* Preview results */}
          {preview && !result && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm">
                <p className="font-semibold text-amber-800 dark:text-amber-300">
                  Preview: {preview.grantedCount} user{preview.grantedCount !== 1 ? 's' : ''} will be granted
                  {preview.skippedCount > 0 && `, ${preview.skippedCount} already have it (will be skipped)`}
                </p>
                {preview.users.filter((u) => u.status === 'granted').length > 0 && (
                  <ul className="mt-2 text-xs text-amber-700 dark:text-amber-400 space-y-0.5 max-h-32 overflow-auto">
                    {preview.users.filter((u) => u.status === 'granted').map((u) => (
                      <li key={u.userId} className="font-mono truncate">{u.userId}</li>
                    ))}
                  </ul>
                )}
              </div>

              {preview.grantedCount > 0 && !confirm && (
                <button
                  onClick={() => setConfirm(true)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-400 transition-colors"
                >
                  Grant to {preview.grantedCount} user{preview.grantedCount !== 1 ? 's' : ''}
                </button>
              )}

              {confirm && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Are you sure?</span>
                  <button
                    onClick={() => runMigrate(false)}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-400 disabled:opacity-40 transition-colors"
                  >
                    {busy ? 'Migrating…' : 'Confirm & Migrate'}
                  </button>
                  <button onClick={() => setConfirm(false)} className="px-3 py-1.5 rounded-lg bg-accent text-sm">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Final result */}
          {result && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-300">
              Done — {result.grantedCount} granted, {result.skippedCount} skipped (already had it).
              <button onClick={reset} className="ml-3 underline text-xs">Clear</button>
            </div>
          )}
        </div>
      )}
    </div>
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
          <p className="text-xs text-muted-foreground mt-0.5">
            {users.length} user{users.length !== 1 ? 's' : ''} registered
            {filtered.length !== users.length && ` · ${filtered.length} shown`}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-accent text-sm font-medium hover:bg-accent disabled:opacity-40 transition-colors"
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

      <BulkMigratePanel authFetch={authFetch} />

      {/* Toolbar: search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, username, or ID…"
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">🔍</span>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground text-xs"
            >✕</button>
          )}
        </div>
        <div className="flex gap-1 bg-muted p-0.5 rounded">
          {([['all', 'All'], ['admin', 'Admins'], ['inactive', 'Inactive']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilterRole(val)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${filterRole === val ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-auto max-h-[65vh]">
          <table className="w-full table-auto text-sm">
            <thead className="bg-muted sticky top-0 z-10">
              <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                <th className="p-2.5 cursor-pointer hover:text-foreground dark:hover:text-foreground" onClick={() => toggleSort('name')}>
                  User{sortIcon('name')}
                </th>
                <th className="p-2.5 cursor-pointer hover:text-foreground dark:hover:text-foreground" onClick={() => toggleSort('email')}>
                  Email{sortIcon('email')}
                </th>
                <th className="p-2.5">Flags</th>
                <th className="p-2.5 cursor-pointer hover:text-foreground dark:hover:text-foreground" onClick={() => toggleSort('lastLogin')}>
                  Last Login{sortIcon('lastLogin')}
                </th>
                <th className="p-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
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
