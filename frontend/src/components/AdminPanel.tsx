import React, { useEffect, useState } from 'react'
import { useAuthFetch } from '../auth/useAuthFetch'

export default function AdminPanel() {
  const authFetch = useAuthFetch()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch('/admin/users?limit=200')
      if (!res.ok) throw new Error('fetch failed')
      const data = await res.json()
      setUsers(Array.isArray(data.users) ? data.users : [])
    } catch (err: any) {
      setError(err?.message || 'load failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function toggleFlag(sub: string, field: 'isAdmin' | 'isActive', value: boolean) {
    try {
      const res = await authFetch(`/admin/users/${encodeURIComponent(sub)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) throw new Error('update failed')
      await load()
    } catch (err: any) {
      setError(err?.message || 'update failed')
    }
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-3">Admin: Users</h2>
      {loading && <div>Loading…</div>}
      {error && <div className="text-red-500">{error}</div>}
      <div className="overflow-auto max-h-[60vh]">
        <table className="w-full table-auto text-sm">
          <thead>
            <tr className="text-left">
              <th className="p-2">User ID</th>
              <th className="p-2">Email</th>
              <th className="p-2">Full name</th>
              <th className="p-2">Admin</th>
              <th className="p-2">Active</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.userId} className="border-t">
                <td className="p-2">{u.userId}</td>
                <td className="p-2">{u.email}</td>
                <td className="p-2">{u.name}</td>
                <td className="p-2">{String(!!u.isAdmin)}</td>
                <td className="p-2">{String(u.isActive !== false)}</td>
                <td className="p-2">
                  <button
                    className="mr-2 px-2 py-1 rounded text-sm bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    onClick={() => toggleFlag(u.userId, 'isAdmin', !u.isAdmin)}
                  >
                    {u.isAdmin ? 'Revoke admin' : 'Make admin'}
                  </button>
                  <button
                    className="px-2 py-1 rounded text-sm bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    onClick={() => toggleFlag(u.userId, 'isActive', !u.isActive)}
                  >
                    {u.isActive === false ? 'Activate' : 'Deactivate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
