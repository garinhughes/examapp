import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { useAuthFetch } from '../auth/useAuthFetch'
import { useFeedback } from './FeedbackContext'

type Tab = 'issues' | 'ratings'

interface IssueReport {
  reportId: string
  reporterEmail: string
  reporterName: string
  contentType: string
  contentId: string
  examCode?: string
  issueType?: string
  description: string
  createdAt: string
  status: string
}

interface RatingItem {
  userId: string
  SK: string
  contentType: string
  contentId: string
  userEmail?: string
  stars: number
  difficulty: string
  comment?: string
  createdAt: string
}

function StarDisplay({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`w-3.5 h-3.5 ${n <= count ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'}`}
        />
      ))}
    </span>
  )
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

function truncate(text: string, max = 80) {
  return text.length > max ? text.slice(0, max) + '…' : text
}

export function FeedbackPage() {
  const authFetch = useAuthFetch()
  const { markVisited } = useFeedback()

  const [tab, setTab] = useState<Tab>('issues')
  const [issues, setIssues] = useState<IssueReport[]>([])
  const [ratings, setRatings] = useState<RatingItem[]>([])
  const [issuesLastKey, setIssuesLastKey] = useState<any>(null)
  const [ratingsLastKey, setRatingsLastKey] = useState<any>(null)
  const [loadingIssues, setLoadingIssues] = useState(false)
  const [loadingRatings, setLoadingRatings] = useState(false)
  const [hideResolved, setHideResolved] = useState(true)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  useEffect(() => {
    markVisited()
  }, [])

  useEffect(() => {
    if (tab === 'issues' && issues.length === 0) loadIssues()
    if (tab === 'ratings' && ratings.length === 0) loadRatings()
  }, [tab])

  async function loadIssues(lastKey?: any) {
    setLoadingIssues(true)
    try {
      const params = new URLSearchParams({ tab: 'issues', limit: '50' })
      if (lastKey) params.set('lastKey', encodeURIComponent(JSON.stringify(lastKey)))
      const res = await authFetch(`/admin/feedback?${params}`)
      if (res.ok) {
        const data = await res.json()
        setIssues((prev) => lastKey ? [...prev, ...data.items] : data.items)
        setIssuesLastKey(data.lastKey)
      }
    } finally {
      setLoadingIssues(false)
    }
  }

  async function loadRatings(lastKey?: any) {
    setLoadingRatings(true)
    try {
      const params = new URLSearchParams({ tab: 'ratings', limit: '50' })
      if (lastKey) params.set('lastKey', encodeURIComponent(JSON.stringify(lastKey)))
      const res = await authFetch(`/admin/feedback?${params}`)
      if (res.ok) {
        const data = await res.json()
        setRatings((prev) => lastKey ? [...prev, ...data.items] : data.items)
        setRatingsLastKey(data.lastKey)
      }
    } finally {
      setLoadingRatings(false)
    }
  }

  async function handleResolve(reportId: string) {
    setResolvingId(reportId)
    try {
      const res = await authFetch(`/admin/issues/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      })
      if (res.ok) {
        setIssues((prev) => prev.map((r) => r.reportId === reportId ? { ...r, status: 'resolved' } : r))
      }
    } finally {
      setResolvingId(null)
    }
  }

  const visibleIssues = hideResolved ? issues.filter((r) => r.status !== 'resolved') : issues

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(['issues', 'ratings'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'issues' ? 'Issues' : 'Ratings'}
          </button>
        ))}
      </div>

      {/* Issues tab */}
      {tab === 'issues' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideResolved}
                onChange={(e) => setHideResolved(e.target.checked)}
                className="rounded border-border"
              />
              Hide resolved
            </label>
            <span className="text-xs text-muted-foreground">{visibleIssues.length} item{visibleIssues.length !== 1 ? 's' : ''}</span>
          </div>

          {loadingIssues && issues.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
          ) : visibleIssues.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No issues found.</div>
          ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground text-xs">
                    <th className="text-left px-3 py-2 font-medium">Reporter</th>
                    <th className="text-left px-3 py-2 font-medium">Content</th>
                    <th className="text-left px-3 py-2 font-medium">Issue</th>
                    <th className="text-left px-3 py-2 font-medium">Description</th>
                    <th className="text-left px-3 py-2 font-medium">Date</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibleIssues.map((r) => (
                    <tr key={r.reportId} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 text-xs">{r.reporterEmail}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className="capitalize">{r.contentType}</span>
                        {r.examCode && <span className="text-muted-foreground"> · {r.examCode}</span>}
                        <br />
                        <span className="text-muted-foreground font-mono">{truncate(r.contentId, 24)}</span>
                      </td>
                      <td className="px-3 py-2 text-xs">{r.issueType ?? '—'}</td>
                      <td className="px-3 py-2 text-xs max-w-xs" title={r.description}>{truncate(r.description)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(r.createdAt)}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          r.status === 'resolved'
                            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                            : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {r.status === 'open' && (
                          <button
                            onClick={() => handleResolve(r.reportId)}
                            disabled={resolvingId === r.reportId}
                            className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80 transition-colors disabled:opacity-50"
                          >
                            Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {issuesLastKey && (
            <button
              onClick={() => loadIssues(issuesLastKey)}
              disabled={loadingIssues}
              className="text-sm text-primary hover:underline disabled:opacity-50"
            >
              {loadingIssues ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}

      {/* Ratings tab */}
      {tab === 'ratings' && (
        <div className="space-y-3">
          <span className="text-xs text-muted-foreground">{ratings.length} item{ratings.length !== 1 ? 's' : ''} loaded</span>

          {loadingRatings && ratings.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
          ) : ratings.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No ratings yet.</div>
          ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground text-xs">
                    <th className="text-left px-3 py-2 font-medium">Email</th>
                    <th className="text-left px-3 py-2 font-medium">Content</th>
                    <th className="text-left px-3 py-2 font-medium">Stars</th>
                    <th className="text-left px-3 py-2 font-medium">Difficulty</th>
                    <th className="text-left px-3 py-2 font-medium">Comment</th>
                    <th className="text-left px-3 py-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ratings.map((r) => (
                    <tr key={`${r.userId}-${r.SK}`} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.userEmail ?? r.userId.slice(0, 8) + '…'}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className="capitalize">{r.contentType}</span>
                        <br />
                        <span className="text-muted-foreground font-mono">{truncate(r.contentId, 24)}</span>
                      </td>
                      <td className="px-3 py-2"><StarDisplay count={r.stars} /></td>
                      <td className="px-3 py-2 text-xs capitalize">{r.difficulty.replace('-', ' ')}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs" title={r.comment}>{r.comment ? truncate(r.comment) : '—'}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {ratingsLastKey && (
            <button
              onClick={() => loadRatings(ratingsLastKey)}
              disabled={loadingRatings}
              className="text-sm text-primary hover:underline disabled:opacity-50"
            >
              {loadingRatings ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
