import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useAuthFetch } from '../auth/useAuthFetch'
import { useAuth, type AuthUser } from '../auth/AuthContext'
import { apiUrl } from '@/apiBase'

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
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

interface ErasurePreviewData {
  targetUserId: string
  targetEmail: string | null
  targetName: string | null
  registeredAt: string | null
  counts: {
    attempts: number
    skillLabAttempts: number
    interactions: number
    entitlements: number
    gamification: number
    issueReports: number
  }
}

interface ErasureReceiptData {
  receiptId: string
  deletedAt: string
  adminId: string
  targetUserId: string
  targetEmail: string
  targetName: string
  steps: { name: string; status: 'ok' | 'error'; count: number; detail?: string }[]
  allOk: boolean
}

interface DryRunResult {
  dryRun: true
  targetUserId: string
  targetEmail: string
  targetName: string
  steps: { name: string; status: 'ok' | 'error'; count: number; detail?: string }[]
  allOk: boolean
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
  onDeleteUser,
  onImpersonate,
  selected,
  onToggleSelect,
}: {
  user: UserRecord
  products: Product[]
  authFetch: ReturnType<typeof useAuthFetch>
  onReload: () => void
  onError: (msg: string) => void
  onDeleteUser: (userId: string) => void
  onImpersonate: (token: string, targetUser: AuthUser) => void
  selected: boolean
  onToggleSelect: (userId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [entitlements, setEntitlements] = useState<Entitlement[]>([])
  const [loadingEnts, setLoadingEnts] = useState(false)
  const [grantProductId, setGrantProductId] = useState('')
  const [granting, setGranting] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [impersonating, setImpersonating] = useState(false)

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

  async function handleImpersonate(e: React.MouseEvent) {
    e.stopPropagation()
    setImpersonating(true)
    try {
      const res = await authFetch(`/admin/impersonate/${encodeURIComponent(user.userId)}`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Impersonation failed' }))
        throw new Error((err as any).message || `HTTP ${res.status}`)
      }
      const data = await res.json()
      onImpersonate(data.token, data.user as AuthUser)
    } catch (err: any) {
      onError(err.message || 'Impersonation failed')
    } finally {
      setImpersonating(false)
    }
  }

  async function deleteUser() {
    setDeleting(true)
    try {
      const res = await authFetch(`/admin/users/${encodeURIComponent(user.userId)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as any).message || `HTTP ${res.status}`)
      if (!(data as any).ok) onError('User partially deleted — check audit log')
      onDeleteUser(user.userId)
    } catch (err: any) {
      onError(err.message || 'Delete failed')
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
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
        <td className="p-2.5 w-8" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(user.userId)}
            className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
          />
        </td>
        <td className="p-2.5">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${user.isActive !== false ? 'bg-emerald-500' : 'bg-red-500'}`} title={user.isActive !== false ? 'Active' : 'Deactivated'} />
            <div>
              <div className="font-medium text-sm">{user.name || '-'}</div>
              {user.username && (
                <div className="text-xs text-primary">@{user.username}</div>
              )}
            </div>
          </div>
        </td>
        <td className="p-2.5 text-sm">{user.email || '-'}</td>
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
          <td colSpan={6} className="p-0">
            <div className="px-4 py-3 bg-muted/50/50 dark:bg-card/20 border-b border-border/60 dark:border-border/60 space-y-4">
              {/* User info & quick actions */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground font-mono truncate max-w-[260px]" title={user.userId}>ID: {user.userId}</span>
                <div className="flex-1" />
                {!user.isAdmin && (
                  <button
                    onClick={handleImpersonate}
                    disabled={impersonating}
                    className="px-2.5 py-1 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 disabled:opacity-50 transition-colors"
                    title="Browse the app as this user"
                  >
                    {impersonating ? 'Starting…' : '👤 Become User'}
                  </button>
                )}
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
                {confirmDelete ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <span className="text-xs text-red-600 dark:text-red-400 font-semibold">
                      {user.isAdmin ? 'Warning: this user is an admin. ' : ''}Delete {user.email || user.name}?
                    </span>
                    <button
                      onClick={deleteUser}
                      disabled={deleting}
                      className="px-2.5 py-1 rounded text-xs font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                    >
                      {deleting ? 'Deleting…' : 'Confirm Delete'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="px-2.5 py-1 rounded text-xs bg-accent text-muted-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}
                    className="px-2.5 py-1 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                  >
                    Delete User
                  </button>
                )}
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
                          <span className="text-[10px] text-muted-foreground">
                            Purchased {fmtDate(ent.purchasedAt)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {ent.expiresAt ? `Expires ${fmtDate(ent.expiresAt)}` : 'No expiry'}
                          </span>

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
                                <span className="text-[10px] text-muted-foreground">Purchased {fmtDate(ent.purchasedAt)}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {ent.expiresAt ? `Expired ${fmtDate(ent.expiresAt)}` : 'No expiry'}
                                </span>
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
                        {p.label} ({p.kind}) - £{(p.priceGBP / 100).toFixed(2)}
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
/*  Sub-component: Bulk Grant Modal                                    */
/* ------------------------------------------------------------------ */

function BulkGrantModal({
  userIds,
  products,
  authFetch,
  onClose,
  onDone,
}: {
  userIds: string[]
  products: Product[]
  authFetch: ReturnType<typeof useAuthFetch>
  onClose: () => void
  onDone: () => void
}) {
  const [productId, setProductId] = useState('')
  const defaultExpiry = new Date(Date.now() + 30 * 86400 * 1000).toISOString().slice(0, 10)
  const [expiryDate, setExpiryDate] = useState(defaultExpiry)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ granted: number; skipped: number; errors: string[] } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (!productId || !expiryDate) return
    setBusy(true)
    setErr(null)
    try {
      const res = await authFetch('/admin/bulk-entitlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grant',
          userIds,
          productId,
          expiresAt: new Date(expiryDate).toISOString(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Grant failed')
      setResult(data)
    } catch (e: any) {
      setErr(e.message || 'Grant failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border shadow-xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-base">Grant Promo Access</h3>
        <p className="text-xs text-muted-foreground">
          Grant a time-limited entitlement to {userIds.length} selected user{userIds.length !== 1 ? 's' : ''}.
          Users who already have the product will be skipped.
        </p>

        {!result ? (
          <>
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Product</label>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="px-2 py-1.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Select product…</option>
                  {products.filter((p) => p.available !== false).map((p) => (
                    <option key={p.productId} value={p.productId}>
                      {p.label} ({p.kind})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Access expires on</label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className="px-2 py-1.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            {err && (
              <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
                {err}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-accent text-sm text-muted-foreground">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!productId || !expiryDate || busy}
                className="px-4 py-1.5 rounded-lg bg-emerald-500 text-white text-sm font-semibold disabled:opacity-40 hover:bg-emerald-400 transition-colors"
              >
                {busy ? 'Granting…' : `Grant to ${userIds.length} user${userIds.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-300">
              Done - {result.granted} granted, {result.skipped} skipped (already had access).
              {result.errors.length > 0 && (
                <div className="mt-1 text-red-600 dark:text-red-400">
                  {result.errors.length} error{result.errors.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button onClick={onDone} className="px-4 py-1.5 rounded-lg bg-primary text-white text-sm font-semibold">
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sub-component: Bulk Revoke Modal                                   */
/* ------------------------------------------------------------------ */

function BulkRevokeModal({
  userIds,
  products,
  authFetch,
  onClose,
  onDone,
}: {
  userIds: string[]
  products: Product[]
  authFetch: ReturnType<typeof useAuthFetch>
  onClose: () => void
  onDone: () => void
}) {
  const [productId, setProductId] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ granted: number; skipped: number; errors: string[] } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)

  async function submit() {
    if (!productId) return
    setBusy(true)
    setErr(null)
    try {
      const res = await authFetch('/admin/bulk-entitlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke', userIds, productId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Revoke failed')
      setResult(data)
    } catch (e: any) {
      setErr(e.message || 'Revoke failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border shadow-xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-base">Revoke Access</h3>
        <p className="text-xs text-muted-foreground">
          Revoke a product entitlement from {userIds.length} selected user{userIds.length !== 1 ? 's' : ''}.
        </p>

        {!result ? (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Product to revoke</label>
              <select
                value={productId}
                onChange={(e) => { setProductId(e.target.value); setConfirm(false) }}
                className="px-2 py-1.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">Select product…</option>
                {products.map((p) => (
                  <option key={p.productId} value={p.productId}>
                    {p.label} ({p.kind})
                  </option>
                ))}
              </select>
            </div>

            {err && (
              <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
                {err}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-accent text-sm text-muted-foreground">
                Cancel
              </button>
              {!confirm ? (
                <button
                  onClick={() => setConfirm(true)}
                  disabled={!productId}
                  className="px-4 py-1.5 rounded-lg bg-red-500 text-white text-sm font-semibold disabled:opacity-40 hover:bg-red-400 transition-colors"
                >
                  Revoke…
                </button>
              ) : (
                <button
                  onClick={submit}
                  disabled={busy}
                  className="px-4 py-1.5 rounded-lg bg-red-500 text-white text-sm font-semibold disabled:opacity-40 hover:bg-red-400 transition-colors"
                >
                  {busy ? 'Revoking…' : `Confirm revoke from ${userIds.length} user${userIds.length !== 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-300">
              Done - {result.granted} revoked.
              {result.errors.length > 0 && (
                <div className="mt-1 text-red-600 dark:text-red-400">
                  {result.errors.length} error{result.errors.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button onClick={onDone} className="px-4 py-1.5 rounded-lg bg-primary text-white text-sm font-semibold">
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
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
                  <option key={e.code} value={e.code}>{e.code} - {e.title}</option>
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
                  <option key={e.code} value={e.code}>{e.code} - {e.title}</option>
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
              Done - {result.grantedCount} granted, {result.skippedCount} skipped (already had it).
              <button onClick={reset} className="ml-3 underline text-xs">Clear</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sub-component: Cognito User Management (unconfirmed etc.)          */
/* ------------------------------------------------------------------ */

interface CognitoUser {
  username: string
  email: string | null
  status: string
  enabled: boolean
  createdAt: string | null
}

function CognitoUsersPanel({
  authFetch,
}: {
  authFetch: ReturnType<typeof useAuthFetch>
}) {
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<CognitoUser[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('UNCONFIRMED')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [resent, setResent] = useState<Set<string>>(new Set())

  const loadUsers = useCallback(async (status?: string) => {
    setLoading(true)
    setErr(null)
    try {
      const qs = status ? `?status=${encodeURIComponent(status)}` : ''
      const res = await authFetch(`/admin/cognito/users${qs}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: 'Request failed' }))
        throw new Error(data.detail || data.message || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setUsers(Array.isArray(data.users) ? data.users : [])
    } catch (e: any) {
      setErr(e.message || 'Failed to load Cognito users')
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => {
    if (open) loadUsers(statusFilter)
  }, [open, statusFilter, loadUsers])

  async function deleteUser(username: string) {
    setBusy(username)
    setErr(null)
    try {
      const res = await authFetch(`/admin/cognito/users/${encodeURIComponent(username)}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: 'Delete failed' }))
        throw new Error(data.detail || data.message)
      }
      setConfirmDelete(null)
      setUsers((prev) => prev.filter((u) => u.username !== username))
    } catch (e: any) {
      setErr(e.message || 'Delete failed')
    } finally {
      setBusy(null)
    }
  }

  async function resendConfirmation(username: string) {
    setBusy(username)
    setErr(null)
    try {
      const res = await authFetch(`/admin/cognito/users/${encodeURIComponent(username)}/resend`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: 'Resend failed' }))
        throw new Error(data.detail || data.message)
      }
      setResent((prev) => new Set(prev).add(username))
    } catch (e: any) {
      setErr(e.message || 'Resend failed')
    } finally {
      setBusy(null)
    }
  }

  const STATUS_BADGE: Record<string, string> = {
    UNCONFIRMED: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    CONFIRMED: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
    FORCE_CHANGE_PASSWORD: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    RESET_REQUIRED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    DISABLED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-muted text-sm font-semibold hover:bg-muted/80 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span>Cognito User Management</span>
        <span className={`text-xs transition-transform inline-block ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div className="p-4 space-y-4 bg-card">
          <p className="text-xs text-muted-foreground">
            View and manage users directly in the Cognito user pool. Useful for clearing stuck registrations and resending verification emails.
          </p>

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Status:</label>
            <div className="flex gap-1 bg-muted p-0.5 rounded">
              {['UNCONFIRMED', 'CONFIRMED', 'ALL'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s === 'ALL' ? '' : s)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    (s === 'ALL' ? !statusFilter : statusFilter === s) ? 'bg-card shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <button
              onClick={() => loadUsers(statusFilter)}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-accent text-xs font-medium hover:bg-accent disabled:opacity-40 transition-colors"
            >
              {loading ? 'Loading…' : '↻ Refresh'}
            </button>
          </div>

          {err && (
            <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
              {err}
              <button onClick={() => setErr(null)} className="ml-2 underline text-xs">dismiss</button>
            </div>
          )}

          {/* Users list */}
          {loading && users.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-4">Loading…</div>
          ) : users.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-4 italic">
              No {statusFilter ? statusFilter.toLowerCase().replace(/_/g, ' ') : ''} users found.
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full table-auto text-sm">
                <thead className="bg-muted">
                  <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="p-2.5">Email / Username</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Created</th>
                    <th className="p-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.username} className="border-t border-border/60 hover:bg-muted/50 transition-colors">
                      <td className="p-2.5">
                        <div className="font-medium text-sm">{u.email || u.username}</div>
                        {u.email && u.email !== u.username && (
                          <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[240px]">{u.username}</div>
                        )}
                      </td>
                      <td className="p-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${STATUS_BADGE[u.status] ?? 'bg-accent text-muted-foreground'}`}>
                          {u.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="p-2.5 text-xs text-muted-foreground">{fmtDateTime(u.createdAt)}</td>
                      <td className="p-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Resend confirmation (only for UNCONFIRMED) */}
                          {u.status === 'UNCONFIRMED' && (
                            <button
                              onClick={() => resendConfirmation(u.username)}
                              disabled={busy === u.username || resent.has(u.username)}
                              className="px-2 py-1 rounded text-[11px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 disabled:opacity-40 transition-colors"
                            >
                              {busy === u.username ? 'Sending…' : resent.has(u.username) ? 'Sent' : 'Resend code'}
                            </button>
                          )}

                          {/* Delete with confirmation */}
                          {confirmDelete === u.username ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => deleteUser(u.username)}
                                disabled={busy === u.username}
                                className="px-2 py-1 rounded text-[11px] font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                              >
                                {busy === u.username ? 'Deleting…' : 'Confirm'}
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="px-2 py-1 rounded text-[11px] bg-accent text-muted-foreground transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(u.username)}
                              className="px-2 py-1 rounded text-[11px] font-medium bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground">
            Showing {users.length} user{users.length !== 1 ? 's' : ''} from Cognito.
            {statusFilter === 'UNCONFIRMED' && ' These users registered but never confirmed their email.'}
          </p>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main AdminPanel                                                    */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Sub-component: Emails Panel                                        */
/* ------------------------------------------------------------------ */

interface EmailTemplate {
  templateId: string
  name: string
  subject: string
  htmlBody: string
  updatedAt?: string
}

interface EmailLogRecord {
  logId: string
  type: string
  sentAt: string
  sentBy?: string
  recipientCount: number
  subject: string
  filters?: Record<string, any>
}

function EmailsPanel({ authFetch }: { authFetch: ReturnType<typeof useAuthFetch> }) {
  const [open, setOpen] = useState(false)
  const [subTab, setSubTab] = useState<'templates' | 'campaign' | 'logs'>('templates')

  // Templates state
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [editing, setEditing] = useState<Partial<EmailTemplate> | null>(null)
  const [templateErr, setTemplateErr] = useState<string | null>(null)
  const [templateSuccess, setTemplateSuccess] = useState<string | null>(null)
  const [testSending, setTestSending] = useState(false)

  // Campaign state
  const [campaignTemplate, setCampaignTemplate] = useState('')
  const [campaignProvider, setCampaignProvider] = useState('')
  const [campaignExamProductId, setCampaignExamProductId] = useState('')
  const [campaignMonthlyOnly, setCampaignMonthlyOnly] = useState(false)
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewSample, setPreviewSample] = useState<{ email: string; name: string }[]>([])
  const [previewing, setPreviewing] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ sent: number; errors?: string[] } | null>(null)
  const [confirmSend, setConfirmSend] = useState(false)
  const [campaignErr, setCampaignErr] = useState<string | null>(null)

  // Logs state
  const [logs, setLogs] = useState<EmailLogRecord[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsErr, setLogsErr] = useState<string | null>(null)

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true)
    setTemplateErr(null)
    try {
      const res = await authFetch('/admin/email-templates')
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Load failed')
      setTemplates(Array.isArray(data.templates) ? data.templates : [])
    } catch (e: any) {
      setTemplateErr(e?.message ?? 'Failed to load templates')
    } finally {
      setTemplatesLoading(false)
    }
  }, [authFetch])

  const loadLogs = useCallback(async () => {
    setLogsLoading(true)
    setLogsErr(null)
    try {
      const res = await authFetch('/admin/email-logs?limit=50')
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Load failed')
      setLogs(Array.isArray(data.logs) ? data.logs : [])
    } catch (e: any) {
      setLogsErr(e?.message ?? 'Failed to load logs')
    } finally {
      setLogsLoading(false)
    }
  }, [authFetch])

  useEffect(() => {
    if (!open) return
    loadTemplates()
  }, [open, loadTemplates])

  useEffect(() => {
    if (open && subTab === 'logs') loadLogs()
  }, [open, subTab, loadLogs])

  async function saveTemplate() {
    if (!editing) return
    const isNew = !editing.templateId
    setTemplateErr(null)
    try {
      const res = await authFetch(
        isNew ? '/admin/email-templates' : `/admin/email-templates/${editing.templateId}`,
        {
          method: isNew ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editing),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Save failed')
      setTemplateSuccess('Saved!')
      setTimeout(() => setTemplateSuccess(null), 3000)
      setEditing(null)
      loadTemplates()
    } catch (e: any) {
      setTemplateErr(e?.message ?? 'Save failed')
    }
  }

  async function deleteTemplate(templateId: string) {
    try {
      const res = await authFetch(`/admin/email-templates/${templateId}`, { method: 'DELETE' })
      if (res.ok) loadTemplates()
    } catch { /* noop */ }
  }

  async function sendTest(templateId: string) {
    setTestSending(true)
    setTemplateErr(null)
    try {
      const res = await authFetch('/admin/email/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Test send failed')
      setTemplateSuccess('Test email sent to your address!')
      setTimeout(() => setTemplateSuccess(null), 4000)
    } catch (e: any) {
      setTemplateErr(e?.message ?? 'Test send failed')
    } finally {
      setTestSending(false)
    }
  }

  function resetPreview() {
    setPreviewCount(null)
    setPreviewSample([])
  }

  async function previewRecipients() {
    setPreviewing(true)
    resetPreview()
    setCampaignErr(null)
    try {
      const res = await authFetch('/admin/email/preview-recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: campaignProvider || undefined,
          examProductId: campaignExamProductId || undefined,
          monthlyOnly: campaignMonthlyOnly || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Preview failed')
      setPreviewCount(data.count)
      setPreviewSample(data.sample ?? [])
    } catch (e: any) {
      setCampaignErr(e?.message ?? 'Preview failed')
    } finally {
      setPreviewing(false)
    }
  }

  async function sendCampaign() {
    if (!campaignTemplate) return
    setSending(true)
    setSendResult(null)
    setCampaignErr(null)
    try {
      const res = await authFetch('/admin/email/send-marketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: campaignTemplate,
          provider: campaignProvider || undefined,
          examProductId: campaignExamProductId || undefined,
          monthlyOnly: campaignMonthlyOnly || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Send failed')
      setSendResult(data)
      setConfirmSend(false)
    } catch (e: any) {
      setCampaignErr(e?.message ?? 'Send failed')
      setConfirmSend(false)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted text-sm font-semibold hover:bg-muted/80 transition-colors"
      >
        <span>✉ Email Management</span>
        <span className="text-muted-foreground text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="p-4 space-y-4">
          {/* Sub-tabs */}
          <div className="flex gap-1 bg-muted p-0.5 rounded">
            {(['templates', 'campaign', 'logs'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setSubTab(t)}
                className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  subTab === t ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground dark:hover:text-foreground'
                }`}
              >
                {{ templates: '📄 Templates', campaign: '📣 Send Campaign', logs: '📋 Logs' }[t]}
              </button>
            ))}
          </div>

          {/* TEMPLATES */}
          {subTab === 'templates' && (
            <div className="space-y-3">
              {templateErr && (
                <div className="p-3 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
                  {templateErr}
                  <button onClick={() => setTemplateErr(null)} className="ml-2 underline">dismiss</button>
                </div>
              )}
              {templateSuccess && (
                <div className="p-2 rounded bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-600 dark:text-emerald-400">
                  {templateSuccess}
                </div>
              )}

              {editing !== null ? (
                <div className="space-y-3 p-3 rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{editing.templateId ? 'Edit template' : 'New template'}</h3>
                    <button onClick={() => setEditing(null)} className="text-xs text-muted-foreground hover:text-foreground dark:hover:text-foreground">Cancel</button>
                  </div>
                  <input
                    type="text"
                    placeholder="Template name (e.g. new-content-july)"
                    value={editing.name ?? ''}
                    onChange={(e) => setEditing((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <input
                    type="text"
                    placeholder="Subject line"
                    value={editing.subject ?? ''}
                    onChange={(e) => setEditing((prev) => ({ ...prev, subject: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      HTML body — use <code className="font-mono bg-muted px-1 rounded">{'{{name}}'}</code> for recipient name
                    </label>
                    <textarea
                      rows={12}
                      placeholder="<p>Hello {{name}}, ...</p>"
                      value={editing.htmlBody ?? ''}
                      onChange={(e) => setEditing((prev) => ({ ...prev, htmlBody: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-card text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
                    />
                  </div>
                  <button
                    onClick={saveTemplate}
                    disabled={!editing.name?.trim() || !editing.subject?.trim() || !editing.htmlBody?.trim()}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 hover:bg-primary/80 transition-colors"
                  >
                    Save template
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setEditing({})}
                  className="w-full px-3 py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  + New template
                </button>
              )}

              {templatesLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : templates.length === 0 ? (
                <p className="text-xs text-muted-foreground">No templates yet.</p>
              ) : (
                <div className="space-y-2">
                  {templates.map((tmpl) => (
                    <div key={tmpl.templateId} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{tmpl.name}</span>
                          <span className="text-xs text-muted-foreground font-mono">{tmpl.templateId}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{tmpl.subject}</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          onClick={() => sendTest(tmpl.templateId)}
                          disabled={testSending}
                          className="px-2 py-1 rounded text-xs bg-muted text-muted-foreground hover:text-foreground dark:hover:text-foreground transition-colors disabled:opacity-40"
                        >
                          Test send
                        </button>
                        <button
                          onClick={() => setEditing(tmpl)}
                          className="px-2 py-1 rounded text-xs bg-muted text-muted-foreground hover:text-foreground dark:hover:text-foreground transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteTemplate(tmpl.templateId)}
                          className="px-2 py-1 rounded text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CAMPAIGN */}
          {subTab === 'campaign' && (
            <div className="space-y-4">
              {campaignErr && (
                <div className="p-3 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
                  {campaignErr}
                  <button onClick={() => setCampaignErr(null)} className="ml-2 underline">dismiss</button>
                </div>
              )}

              {sendResult ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                      Campaign sent — {sendResult.sent} email{sendResult.sent !== 1 ? 's' : ''} delivered
                    </p>
                    {sendResult.errors && sendResult.errors.length > 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        {sendResult.errors.length} error{sendResult.errors.length !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => { setSendResult(null); resetPreview() }}
                    className="text-xs text-muted-foreground hover:text-foreground dark:hover:text-foreground underline"
                  >
                    Send another campaign
                  </button>
                </div>
              ) : (
                <>
                  {/* Template */}
                  <div className="p-4 rounded-lg border border-border bg-card space-y-2">
                    <label className="text-xs font-medium text-muted-foreground block">Template</label>
                    <select
                      value={campaignTemplate}
                      onChange={(e) => { setCampaignTemplate(e.target.value); resetPreview() }}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      <option value="">— Select a template —</option>
                      {templates.map((tmpl) => (
                        <option key={tmpl.templateId} value={tmpl.templateId}>{tmpl.name} — {tmpl.subject}</option>
                      ))}
                    </select>
                    {templates.length === 0 && (
                      <p className="text-xs text-muted-foreground">No templates yet — create one in the Templates tab.</p>
                    )}
                  </div>

                  {/* Filters */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Audience filters <span className="font-normal">(all active filters are ANDed)</span></p>

                    {/* Provider filter */}
                    <div className="p-3 rounded-lg border border-border bg-card space-y-1.5">
                      <label className="text-xs font-medium block">By provider</label>
                      <select
                        value={campaignProvider}
                        onChange={(e) => { setCampaignProvider(e.target.value); resetPreview() }}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        <option value="">Any provider</option>
                        <option value="AWS">AWS customers</option>
                        <option value="Anthropic">Anthropic customers</option>
                      </select>
                    </div>

                    {/* Exam filter */}
                    <div className="p-3 rounded-lg border border-border bg-card space-y-1.5">
                      <label className="text-xs font-medium block">By product</label>
                      <select
                        value={campaignExamProductId}
                        onChange={(e) => { setCampaignExamProductId(e.target.value); resetPreview() }}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        <option value="">Any product</option>
                        <option value="sub:pro">Pro (subscription)</option>
                        <option value="sub:pro-plus">Pro Plus (subscription)</option>
                        <option value="sub:pro-oneoff">Pro (one-off)</option>
                        <option value="sub:pro-plus-oneoff">Pro Plus (one-off)</option>
                      </select>
                    </div>

                    {/* Monthly subscriber filter */}
                    <div className="p-3 rounded-lg border border-border bg-card">
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={campaignMonthlyOnly}
                          onChange={(e) => { setCampaignMonthlyOnly(e.target.checked); resetPreview() }}
                          className="w-4 h-4 rounded border-border accent-primary"
                        />
                        <span className="text-sm">Monthly subscribers only</span>
                      </label>
                    </div>
                  </div>

                  {/* Preview action */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={previewRecipients}
                      disabled={previewing || !campaignTemplate}
                      className="px-3 py-1.5 rounded-lg bg-muted text-sm font-medium hover:bg-muted/80 disabled:opacity-40 transition-colors"
                    >
                      {previewing ? 'Checking…' : 'Preview recipients'}
                    </button>
                    {previewCount !== null && (
                      <span className="text-sm">
                        <strong>{previewCount}</strong> recipient{previewCount !== 1 ? 's' : ''} will receive this email
                      </span>
                    )}
                  </div>

                  {/* Sample recipient list */}
                  {previewSample.length > 0 && (
                    <div className="p-3 rounded-lg border border-border bg-muted/40 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        Sample — first {previewSample.length} recipient{previewSample.length !== 1 ? 's' : ''}
                      </p>
                      {previewSample.map((r, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs font-mono">
                          <span className="text-muted-foreground w-5 text-right shrink-0">{i + 1}.</span>
                          <span className="truncate">{r.email}</span>
                          {r.name && <span className="text-muted-foreground truncate">({r.name})</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {previewCount !== null && previewCount > 0 && campaignTemplate && (
                    confirmSend ? (
                      <div className="p-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 space-y-3">
                        <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                          Send to {previewCount} recipient{previewCount !== 1 ? 's' : ''}? This cannot be undone.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={sendCampaign}
                            disabled={sending}
                            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 hover:bg-primary/80 transition-colors"
                          >
                            {sending ? 'Sending…' : 'Confirm & send'}
                          </button>
                          <button
                            onClick={() => setConfirmSend(false)}
                            disabled={sending}
                            className="px-4 py-2 rounded-lg bg-muted text-sm font-medium hover:bg-muted/80 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmSend(true)}
                        className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/80 transition-colors"
                      >
                        Send campaign to {previewCount} recipient{previewCount !== 1 ? 's' : ''}
                      </button>
                    )
                  )}
                  {previewCount === 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">No opted-in recipients match these filters.</p>
                  )}
                </>
              )}
            </div>
          )}

          {/* LOGS */}
          {subTab === 'logs' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Recent email activity</p>
                <button onClick={loadLogs} disabled={logsLoading} className="text-xs text-muted-foreground hover:text-foreground dark:hover:text-foreground underline">
                  Refresh
                </button>
              </div>
              {logsErr && (
                <div className="p-3 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
                  {logsErr}
                </div>
              )}
              {logsLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : logs.length === 0 ? (
                <p className="text-xs text-muted-foreground">No email activity recorded yet.</p>
              ) : (
                <div className="overflow-auto rounded-lg border border-border">
                  <table className="w-full table-auto text-xs">
                    <thead>
                      <tr className="bg-muted text-muted-foreground text-left uppercase tracking-wider">
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2 text-right">Recipients</th>
                        <th className="px-3 py-2">Subject</th>
                        <th className="px-3 py-2">Sent by</th>
                        <th className="px-3 py-2">Filters</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.logId} className="border-t border-border hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-2">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary">{log.type}</span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{new Date(log.sentAt).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-mono">{log.recipientCount}</td>
                          <td className="px-3 py-2 max-w-[200px] truncate">{log.subject}</td>
                          <td className="px-3 py-2 text-muted-foreground">{log.sentBy ?? '—'}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {log.filters ? Object.entries(log.filters).map(([k, v]) => `${k}:${v}`).join(', ') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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

/* ------------------------------------------------------------------ */
/*  Sub-component: Checklist Row                                       */
/* ------------------------------------------------------------------ */

function ChecklistRow({ label, count, action, note }: { label: string; count: number; action: 'delete' | 'anonymise'; note?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={action === 'delete' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}>
        {action === 'delete' ? '✕' : '~'}
      </span>
      <span className="flex-1">{label}</span>
      <span className="text-muted-foreground">{count} record{count !== 1 ? 's' : ''}</span>
      {note && <span className="text-muted-foreground italic hidden sm:inline">· {note}</span>}
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${action === 'delete' ? 'bg-destructive/10 text-destructive' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'}`}>
        {action}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sub-component: GDPR Erasure Panel                                  */
/* ------------------------------------------------------------------ */

function ErasurePanel({
  authFetch,
  users,
}: {
  authFetch: ReturnType<typeof useAuthFetch>
  users: UserRecord[]
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<UserRecord | null>(null)
  const [preview, setPreview] = useState<ErasurePreviewData | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [confirmInput, setConfirmInput] = useState('')
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null)
  const [loadingDryRun, setLoadingDryRun] = useState(false)
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState<ErasureReceiptData | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const matches = search.length >= 2
    ? users.filter((u) =>
        u.email?.toLowerCase().includes(search.toLowerCase()) ||
        u.name?.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 5)
    : []

  async function selectUser(u: UserRecord) {
    setSelected(u)
    setPreview(null)
    setConfirmInput('')
    setDryRun(null)
    setReceipt(null)
    setErr(null)
    setLoadingPreview(true)
    try {
      const res = await authFetch(`/admin/users/${u.userId}/erasure-preview`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Preview failed')
      setPreview(data)
    } catch (e: any) {
      setErr(e?.message ?? 'Preview failed')
    } finally {
      setLoadingPreview(false)
    }
  }

  async function runDryRun() {
    if (!selected) return
    setLoadingDryRun(true)
    setDryRun(null)
    setErr(null)
    try {
      const res = await authFetch(`/admin/users/${selected.userId}/gdpr-erase-dryrun`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Dry run failed')
      setDryRun(data)
    } catch (e: any) {
      setErr(e?.message ?? 'Dry run failed')
    } finally {
      setLoadingDryRun(false)
    }
  }

  async function executeErasure() {
    if (!selected) return
    setBusy(true)
    setErr(null)
    try {
      const res = await authFetch(`/admin/users/${selected.userId}/gdpr-erase`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Erasure failed')
      setReceipt(data)
    } catch (e: any) {
      setErr(e?.message ?? 'Erasure failed')
      setDryRun(null) // force re-run dry run before retrying
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setSearch('')
    setSelected(null)
    setPreview(null)
    setConfirmInput('')
    setDryRun(null)
    setReceipt(null)
    setErr(null)
    setBusy(false)
  }

  const emailConfirmed = confirmInput === selected?.email && !!preview
  const canDryRun = emailConfirmed && !busy && !loadingDryRun
  const canExecute = emailConfirmed && dryRun?.allOk === true && !busy

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted text-sm font-semibold hover:bg-muted/80 transition-colors"
      >
        <span className="flex items-center gap-2">
          Account Data Erasure (GDPR Compliant)
          <span className="text-amber-500">⚠</span>
        </span>
        <span className={`text-xs transition-transform inline-block ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div className="p-4 space-y-4 bg-card">
          {receipt ? (
            // Step 4 - Receipt
            <div className="space-y-3 pt-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Erasure complete</h3>
                <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground underline">New erasure</button>
              </div>
              <div className="rounded-lg border border-border bg-card p-3 text-xs space-y-1">
                <p><span className="text-muted-foreground">Receipt ID: </span><span className="font-mono">{receipt.receiptId}</span></p>
                <p><span className="text-muted-foreground">Deleted at: </span>{fmtDateTime(receipt.deletedAt)}</p>
                <p><span className="text-muted-foreground">User: </span>{receipt.targetName} ({receipt.targetEmail})</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                {receipt.steps.map((s) => (
                  <div key={s.name} className="flex items-center gap-2 text-xs">
                    <span className={s.status === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}>
                      {s.status === 'ok' ? '✓' : '✗'}
                    </span>
                    <span className="flex-1">{s.name}</span>
                    <span className="text-muted-foreground">{s.count} record{s.count !== 1 ? 's' : ''}</span>
                    {s.detail && <span className="text-destructive text-[10px] truncate max-w-[200px]">{s.detail}</span>}
                  </div>
                ))}
                <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border pt-1.5 mt-1">
                  <span>–</span>
                  <span className="flex-1">Aggregate metrics</span>
                  <span className="italic">kept - not personal data</span>
                </div>
              </div>
              {!receipt.allOk && (
                <p className="text-xs text-destructive">Some steps failed. Check the audit log and re-run if needed.</p>
              )}
              <p className="text-xs text-muted-foreground">Receipt emailed to support@certshack.com - forward to the data subject as evidence of erasure.</p>
            </div>
          ) : selected && (preview || loadingPreview) ? (
            // Step 2 + 3 - Preview checklist + Confirm
            <div className="space-y-3 pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">{selected.name ?? '(no name)'}</p>
                  <p className="text-xs text-muted-foreground">{selected.email}{preview?.registeredAt ? ` · Registered ${fmtDate(preview.registeredAt)}` : ''}</p>
                </div>
                <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground underline">Change user</button>
              </div>

              {loadingPreview ? (
                <div className="h-24 rounded-lg bg-muted animate-pulse" />
              ) : preview && (
                <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                  <ChecklistRow label="Exam attempts" count={preview.counts.attempts} action="delete" />
                  <ChecklistRow label="Skill lab attempts" count={preview.counts.skillLabAttempts} action="delete" />
                  <ChecklistRow label="Ratings & poll votes" count={preview.counts.interactions} action="delete" />
                  <ChecklistRow label="Entitlements" count={preview.counts.entitlements} action="delete" />
                  <ChecklistRow label="Gamification / XP" count={preview.counts.gamification} action="delete" note="removed from leaderboard" />
                  <ChecklistRow label="Issue reports" count={preview.counts.issueReports} action="anonymise" note="content kept, PII stripped" />
                  <ChecklistRow label="User profile" count={1} action="delete" />
                  <ChecklistRow label="Cognito account" count={1} action="delete" />
                  <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border pt-1.5 mt-1">
                    <span>–</span>
                    <span className="flex-1">Aggregate metrics</span>
                    <span className="italic">kept - not personal data (UK GDPR compliant)</span>
                  </div>
                </div>
              )}

              {preview && (
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground block">
                    Type <strong>{selected.email}</strong> to confirm
                  </label>
                  <input
                    type="text"
                    value={confirmInput}
                    onChange={(e) => { setConfirmInput(e.target.value); setDryRun(null) }}
                    placeholder="Type email address to confirm…"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-destructive/40"
                  />
                </div>
              )}

              {/* Dry run results */}
              {dryRun && (
                <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Dry run - no data deleted
                  </p>
                  {dryRun.steps.map((s) => (
                    <div key={s.name} className="flex items-center gap-2 text-xs">
                      <span className={s.status === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}>
                        {s.status === 'ok' ? '✓' : '✗'}
                      </span>
                      <span className="flex-1">{s.name}</span>
                      <span className="text-muted-foreground">{s.count} record{s.count !== 1 ? 's' : ''}</span>
                      {s.detail && <span className="text-destructive text-[10px] truncate max-w-[200px]">{s.detail}</span>}
                    </div>
                  ))}
                  {dryRun.allOk
                    ? <p className="text-xs text-emerald-600 dark:text-emerald-400 pt-1">All checks passed - ready to execute.</p>
                    : <p className="text-xs text-destructive pt-1">One or more checks failed. Fix the issues above and retry the dry run.</p>
                  }
                </div>
              )}

              {err && <p className="text-xs text-destructive">{err}</p>}

              {preview && (
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={runDryRun}
                    disabled={!canDryRun}
                    className="px-4 py-2 rounded-lg border border-border bg-muted text-sm font-semibold hover:bg-muted/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {loadingDryRun ? 'Running dry run…' : dryRun ? 'Retry Dry Run' : 'Dry Run'}
                  </button>
                  {dryRun?.allOk && (
                    <button
                      onClick={executeErasure}
                      disabled={!canExecute}
                      className="px-4 py-2 rounded-lg bg-destructive text-white text-sm font-semibold hover:bg-destructive/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {busy ? 'Executing…' : 'Execute Erasure'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            // Step 1 - Search
            <div className="space-y-3 pt-3">
              <p className="text-xs text-muted-foreground">
                Search by the email address from the user's deletion request.
              </p>
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by email or name…"
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">🔍</span>
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs hover:text-foreground"
                  >✕</button>
                )}
              </div>
              {err && <p className="text-xs text-destructive">{err}</p>}
              {matches.length > 0 && (
                <div className="space-y-1">
                  {matches.map((u) => (
                    <button
                      key={u.userId}
                      onClick={() => selectUser(u)}
                      className="w-full text-left flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-sm"
                    >
                      <div>
                        <span className="font-medium">{u.name ?? '(no name)'}</span>
                        <span className="text-muted-foreground ml-2 text-xs">{u.email}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{fmtDate(u.lastLogin)}</span>
                    </button>
                  ))}
                </div>
              )}
              {search.length >= 2 && matches.length === 0 && (
                <p className="text-xs text-muted-foreground">No users found.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sub-component: Carousel Management Panel                          */
/* ------------------------------------------------------------------ */

interface CarouselSlide {
  id: string
  key: string
  alt: string
  order: number
}

function SlideThumb({ imageKey }: { imageKey: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    fetch(apiUrl(`/images/presigned?key=${encodeURIComponent(imageKey)}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.url && setSrc(d.url))
      .catch(() => {})
  }, [imageKey])
  if (!src) return <div className="w-20 h-14 rounded bg-muted animate-pulse shrink-0" />
  return <img src={src} alt="" className="w-20 h-14 object-cover rounded shrink-0" />
}

function CarouselPanel({ authFetch }: { authFetch: ReturnType<typeof useAuthFetch> }) {
  const [open, setOpen] = useState(false)
  const [slides, setSlides] = useState<CarouselSlide[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // New slide form state
  const [newAlt, setNewAlt] = useState('')
  const [newOrder, setNewOrder] = useState(0)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const res = await authFetch('/admin/carousel')
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Load failed')
      setSlides(Array.isArray(data.slides) ? data.slides : [])
      setNewOrder((data.slides?.length ?? 0) + 1)
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load carousel')
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  async function save(updated: CarouselSlide[]) {
    setSaving(true)
    setErr(null)
    setSuccess(false)
    try {
      const res = await authFetch('/admin/carousel', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slides: updated }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Save failed')
      setSlides(updated)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (e: any) {
      setErr(e?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function updateSlide(id: string, field: 'alt' | 'order', value: string | number) {
    setSlides((prev) => prev.map((s) => s.id === id ? { ...s, [field]: value } : s))
  }

  function deleteSlide(id: string) {
    setSlides((prev) => prev.filter((s) => s.id !== id))
  }

  async function addSlide() {
    const file = fileRef.current?.files?.[0]
    if (!file) { setErr('Pick an image file first'); return }
    if (!newAlt.trim()) { setErr('Alt text is required'); return }
    setUploading(true)
    setErr(null)
    try {
      // Get presigned PUT URL
      const urlRes = await authFetch('/admin/carousel/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name }),
      })
      const urlData = await urlRes.json()
      if (!urlRes.ok) throw new Error(urlData.message || 'Failed to get upload URL')

      // Upload directly to S3
      const uploadRes = await fetch(urlData.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      })
      if (!uploadRes.ok) throw new Error(`S3 upload failed (${uploadRes.status}) - check bucket CORS`)

      const newSlide: CarouselSlide = {
        id: urlData.id,
        key: urlData.key,
        alt: newAlt.trim(),
        order: newOrder,
      }
      const updated = [...slides, newSlide].sort((a, b) => a.order - b.order)
      setNewAlt('')
      setNewOrder(updated.length + 1)
      if (fileRef.current) fileRef.current.value = ''
      await save(updated)
    } catch (e: any) {
      setErr(e?.message ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted text-sm font-semibold hover:bg-muted/80 transition-colors"
      >
        <span>Carousel Management</span>
        <span className="text-muted-foreground text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="p-4 space-y-4">
          {err && (
            <div className="p-3 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
              {err}
              <button onClick={() => setErr(null)} className="ml-2 underline text-xs">dismiss</button>
            </div>
          )}
          {success && (
            <div className="p-3 rounded bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-600 dark:text-emerald-400">
              Carousel saved.
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <>
              {/* Slide list */}
              {slides.length === 0 ? (
                <p className="text-sm text-muted-foreground">No slides yet. Add one below.</p>
              ) : (
                <div className="space-y-2">
                  {slides.map((slide) => (
                    <div key={slide.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                      <SlideThumb imageKey={slide.key} />
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-muted-foreground w-10 shrink-0">Alt</label>
                          <input
                            type="text"
                            value={slide.alt}
                            onChange={(e) => updateSlide(slide.id, 'alt', e.target.value)}
                            className="flex-1 px-2 py-1 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-muted-foreground w-10 shrink-0">Order</label>
                          <input
                            type="number"
                            value={slide.order}
                            onChange={(e) => updateSlide(slide.id, 'order', Number(e.target.value))}
                            className="w-20 px-2 py-1 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                          />
                          <span className="text-xs text-muted-foreground truncate hidden sm:block">{slide.key}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => deleteSlide(slide.id)}
                        className="px-2 py-1 rounded text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new slide */}
              <div className="p-3 rounded-lg border border-dashed border-border space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add slide</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Alt / caption text"
                    value={newAlt}
                    onChange={(e) => setNewAlt(e.target.value)}
                    className="flex-1 px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <input
                    type="number"
                    placeholder="Order"
                    value={newOrder}
                    onChange={(e) => setNewOrder(Number(e.target.value))}
                    className="w-20 px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <button
                  onClick={addSlide}
                  disabled={uploading}
                  className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {uploading ? 'Uploading...' : 'Upload & Add'}
                </button>
              </div>

              {/* Save */}
              <div className="flex justify-end">
                <button
                  onClick={() => save(slides)}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-400 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function AdminPanel() {
  const authFetch = useAuthFetch()
  const { startImpersonation } = useAuth()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState<'all' | 'admin' | 'inactive'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'email' | 'lastLogin'>('lastLogin')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [promoStats, setPromoStats] = useState<{ count: number; limit: number } | null>(null)
  const [showGrantModal, setShowGrantModal] = useState(false)
  const [showRevokeModal, setShowRevokeModal] = useState(false)

  const loadPromoStats = useCallback(async () => {
    try {
      const res = await authFetch('/admin/promo-stats')
      if (res.ok) setPromoStats(await res.json())
    } catch { /* non-critical */ }
  }, [authFetch])

  useEffect(() => { loadPromoStats() }, [loadPromoStats])

  function toggleSelect(userId: string) {
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

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

  function toggleSelectAll() {
    if (selectedUserIds.size === filtered.length && filtered.length > 0) {
      setSelectedUserIds(new Set())
    } else {
      setSelectedUserIds(new Set(filtered.map((u) => u.userId)))
    }
  }

  function handleDeleteUser(userId: string) {
    setUsers((prev) => prev.filter((u) => u.userId !== userId))
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      next.delete(userId)
      return next
    })
  }

  function handleImpersonate(token: string, targetUser: AuthUser) {
    startImpersonation(token, targetUser)
  }

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
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground mt-0.5">
            {users.length} user{users.length !== 1 ? 's' : ''} registered
            {filtered.length !== users.length && ` · ${filtered.length} shown`}
          </p>
          {promoStats && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${promoStats.count >= promoStats.limit ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-primary/10 text-primary'}`}>
              Promo slots: {promoStats.count} / {promoStats.limit} used
            </span>
          )}
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
      <CognitoUsersPanel authFetch={authFetch} />
      <ErasurePanel authFetch={authFetch} users={users} />
      <CarouselPanel authFetch={authFetch} />
      <EmailsPanel authFetch={authFetch} />

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

      {/* Bulk action bar */}
      {selectedUserIds.size > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-sm">
          <span className="font-medium text-primary">
            {selectedUserIds.size} user{selectedUserIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex-1" />
          <button
            onClick={() => setShowGrantModal(true)}
            className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-400 transition-colors"
          >
            Grant access
          </button>
          <button
            onClick={() => setShowRevokeModal(true)}
            className="px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
          >
            Revoke access
          </button>
          <button
            onClick={() => setSelectedUserIds(new Set())}
            className="px-2 py-1.5 rounded-lg bg-accent text-xs text-muted-foreground hover:bg-accent/80 transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-auto max-h-[65vh]">
          <table className="w-full table-auto text-sm">
            <thead className="bg-muted sticky top-0 z-10">
              <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                <th className="p-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedUserIds.size === filtered.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                  />
                </th>
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
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
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
                    onDeleteUser={handleDeleteUser}
                    onImpersonate={handleImpersonate}
                    selected={selectedUserIds.has(u.userId)}
                    onToggleSelect={toggleSelect}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showGrantModal && (
        <BulkGrantModal
          userIds={[...selectedUserIds]}
          products={products}
          authFetch={authFetch}
          onClose={() => setShowGrantModal(false)}
          onDone={() => { setShowGrantModal(false); setSelectedUserIds(new Set()); loadPromoStats() }}
        />
      )}
      {showRevokeModal && (
        <BulkRevokeModal
          userIds={[...selectedUserIds]}
          products={products}
          authFetch={authFetch}
          onClose={() => setShowRevokeModal(false)}
          onDone={() => { setShowRevokeModal(false); setSelectedUserIds(new Set()); loadPromoStats() }}
        />
      )}
    </div>
  )
}
