import { useEffect, useState } from 'react'
import { Star, Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { useAuthFetch } from '../auth/useAuthFetch'
import { useFeedback } from './FeedbackContext'

type Tab = 'issues' | 'ratings' | 'polls'
type PollsSubTab = 'manage' | 'responses'

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

interface PollOption {
  id: string
  label: string
}

interface PollDef {
  pollId: string
  question: string
  options: PollOption[]
  allowComment?: boolean
  visible: boolean
  createdAt: string
}

interface PollVote {
  userId: string
  userEmail?: string
  selectedOptions: string[]
  otherText?: string
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

/* ── Polls Tab ─────────────────────────────────────────────────────────── */

function PollsTab({ authFetch }: { authFetch: ReturnType<typeof useAuthFetch> }) {
  const [subTab, setSubTab] = useState<PollsSubTab>('manage')
  const [polls, setPolls] = useState<PollDef[]>([])
  const [loadingPolls, setLoadingPolls] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQuestion, setEditQuestion] = useState('')
  const [editOptions, setEditOptions] = useState<PollOption[]>([])
  const [editAllowComment, setEditAllowComment] = useState(false)
  const [saving, setSaving] = useState(false)

  // Create form
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState([{ id: crypto.randomUUID(), label: '' }, { id: crypto.randomUUID(), label: '' }])
  const [allowComment, setAllowComment] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Responses
  const [selectedPollId, setSelectedPollId] = useState<string>('')
  const [votes, setVotes] = useState<PollVote[]>([])
  const [votesLastKey, setVotesLastKey] = useState<any>(null)
  const [loadingVotes, setLoadingVotes] = useState(false)

  useEffect(() => {
    loadPolls()
  }, [])

  async function loadPolls() {
    setLoadingPolls(true)
    try {
      const res = await authFetch('/admin/polls')
      if (res.ok) {
        const data = await res.json()
        // Sort by createdAt desc
        const sorted = (data.items as PollDef[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        setPolls(sorted)
        if (sorted.length > 0 && !selectedPollId) setSelectedPollId(sorted[0].pollId)
      }
    } finally {
      setLoadingPolls(false)
    }
  }

  async function toggleActive(poll: PollDef) {
    setToggling(poll.pollId)
    try {
      const res = await authFetch(`/admin/polls/${poll.pollId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible: !poll.visible }),
      })
      if (res.ok) await loadPolls()
    } finally {
      setToggling(null)
    }
  }

  function startEdit(poll: PollDef) {
    setEditingId(poll.pollId)
    setEditQuestion(poll.question)
    setEditOptions(poll.options.map((o) => ({ ...o })))
    setEditAllowComment(poll.allowComment ?? false)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditQuestion('')
    setEditOptions([])
    setEditAllowComment(false)
  }

  async function saveEdit(pollId: string) {
    const filledOptions = editOptions.filter((o) => o.label.trim())
    if (!editQuestion.trim() || filledOptions.length < 2) return
    setSaving(true)
    try {
      const res = await authFetch(`/admin/polls/${pollId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: editQuestion.trim(), options: filledOptions, allowComment: editAllowComment }),
      })
      if (res.ok) {
        cancelEdit()
        await loadPolls()
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(poll: PollDef) {
    if (!confirm(`Delete poll "${poll.question}"?`)) return
    setDeleting(poll.pollId)
    try {
      const res = await authFetch(`/admin/polls/${poll.pollId}`, { method: 'DELETE' })
      if (res.ok) await loadPolls()
    } finally {
      setDeleting(null)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    const filledOptions = options.filter((o) => o.label.trim())
    if (!question.trim()) { setCreateError('Question is required'); return }
    if (filledOptions.length < 2) { setCreateError('At least 2 options are required'); return }

    setCreating(true)
    try {
      const res = await authFetch('/admin/polls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), options: filledOptions, allowComment }),
      })
      if (res.ok) {
        setQuestion('')
        setOptions([{ id: crypto.randomUUID(), label: '' }, { id: crypto.randomUUID(), label: '' }])
        setAllowComment(false)
        await loadPolls()
      } else {
        const d = await res.json()
        setCreateError(d.message ?? 'Failed to create poll')
      }
    } finally {
      setCreating(false)
    }
  }

  async function loadVotes(pollId: string, lastKey?: any) {
    setLoadingVotes(true)
    try {
      const params = new URLSearchParams({ tab: 'polls', pollId, limit: '50' })
      if (lastKey) params.set('lastKey', encodeURIComponent(JSON.stringify(lastKey)))
      const res = await authFetch(`/admin/feedback?${params}`)
      if (res.ok) {
        const data = await res.json()
        setVotes((prev) => lastKey ? [...prev, ...data.items] : data.items)
        setVotesLastKey(data.lastKey)
      }
    } finally {
      setLoadingVotes(false)
    }
  }

  useEffect(() => {
    if (subTab === 'responses' && selectedPollId) {
      setVotes([])
      setVotesLastKey(null)
      loadVotes(selectedPollId)
    }
  }, [subTab, selectedPollId])

  const selectedPoll = polls.find((p) => p.pollId === selectedPollId)

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-border">
        {(['manage', 'responses'] as PollsSubTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              subTab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'manage' ? 'Manage' : 'Responses'}
          </button>
        ))}
      </div>

      {subTab === 'manage' && (
        <div className="space-y-6">
          {/* Create new poll */}
          <form onSubmit={handleCreate} className="space-y-3 p-4 rounded-lg border border-border bg-card">
            <p className="text-sm font-semibold">Create new poll</p>
            <input
              type="text"
              placeholder="Question (e.g. What features would you like to see?)"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={opt.id} className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder={`Option ${i + 1}`}
                    value={opt.label}
                    onChange={(e) => setOptions((prev) => prev.map((o) => o.id === opt.id ? { ...o, label: e.target.value } : o))}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setOptions((prev) => prev.filter((o) => o.id !== opt.id))}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setOptions((prev) => [...prev, { id: crypto.randomUUID(), label: '' }])}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus className="w-3.5 h-3.5" /> Add option
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allowComment}
                onChange={(e) => setAllowComment(e.target.checked)}
                className="rounded border-border"
              />
              Allow free-text comment
            </label>
            {createError && <p className="text-xs text-red-500">{createError}</p>}
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-1.5 rounded bg-primary text-white text-sm font-medium disabled:opacity-40 transition-opacity"
            >
              {creating ? 'Creating…' : 'Create Poll'}
            </button>
          </form>

          {/* Existing polls */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{polls.length} poll{polls.length !== 1 ? 's' : ''}</p>
              <button onClick={loadPolls} disabled={loadingPolls} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                {loadingPolls ? 'Loading…' : '↻ Refresh'}
              </button>
            </div>
            {polls.length === 0 && !loadingPolls && (
              <p className="text-sm text-muted-foreground py-4 text-center">No polls yet.</p>
            )}
            {polls.map((poll) => (
              <div key={poll.pollId} className="p-3 rounded-lg border border-border bg-card text-sm space-y-1.5">
                {editingId === poll.pollId ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editQuestion}
                      onChange={(e) => setEditQuestion(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <div className="space-y-1.5">
                      {editOptions.map((opt, i) => (
                        <div key={opt.id} className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={opt.label}
                            placeholder={`Option ${i + 1}`}
                            onChange={(e) => setEditOptions((prev) => prev.map((o) => o.id === opt.id ? { ...o, label: e.target.value } : o))}
                            className="flex-1 px-3 py-1 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                          />
                          {editOptions.length > 2 && (
                            <button type="button" onClick={() => setEditOptions((prev) => prev.filter((o) => o.id !== opt.id))} className="text-muted-foreground hover:text-destructive transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={() => setEditOptions((prev) => [...prev, { id: crypto.randomUUID(), label: '' }])} className="flex items-center gap-1 text-xs text-primary hover:underline">
                        <Plus className="w-3.5 h-3.5" /> Add option
                      </button>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editAllowComment}
                        onChange={(e) => setEditAllowComment(e.target.checked)}
                        className="rounded border-border"
                      />
                      Allow free-text comment
                    </label>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => saveEdit(poll.pollId)} disabled={saving} className="flex items-center gap-1 px-3 py-1 rounded bg-primary text-white text-xs font-medium disabled:opacity-40">
                        <Check className="w-3.5 h-3.5" /> Save
                      </button>
                      <button onClick={cancelEdit} className="flex items-center gap-1 px-3 py-1 rounded bg-muted text-muted-foreground text-xs hover:bg-muted/80">
                        <X className="w-3.5 h-3.5" /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium">{poll.question}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => toggleActive(poll)}
                          disabled={toggling === poll.pollId}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                            poll.visible
                              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/50'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                        >
                          {toggling === poll.pollId ? '…' : poll.visible ? 'Active' : 'Inactive'}
                        </button>
                        <button onClick={() => startEdit(poll)} className="p-1 text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(poll)} disabled={deleting === poll.pollId} className="p-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {poll.options.map((o) => (
                        <span key={o.id} className="px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground">{o.label}</span>
                      ))}
                      {poll.allowComment && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs">+ comments</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDate(poll.createdAt)}</p>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'responses' && (
        <div className="space-y-3">
          {polls.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No polls yet.</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <label className="text-sm text-muted-foreground shrink-0">Poll:</label>
                <select
                  value={selectedPollId}
                  onChange={(e) => setSelectedPollId(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {polls.map((p) => (
                    <option key={p.pollId} value={p.pollId}>
                      {p.question}{p.visible ? ' (active)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {loadingVotes && votes.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
              ) : votes.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">No responses yet.</div>
              ) : (
                <>
                  <span className="text-xs text-muted-foreground">{votes.length} response{votes.length !== 1 ? 's' : ''} loaded</span>
                  <div className="rounded-md border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 text-muted-foreground text-xs">
                          <th className="text-left px-3 py-2 font-medium">User</th>
                          <th className="text-left px-3 py-2 font-medium">Selected</th>
                          {selectedPoll?.allowComment && <th className="text-left px-3 py-2 font-medium">Comment</th>}
                          <th className="text-left px-3 py-2 font-medium">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {votes.map((v) => (
                          <tr key={v.userId} className="hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2 text-xs text-muted-foreground">{v.userEmail ?? truncate(v.userId, 16)}</td>
                            <td className="px-3 py-2 text-xs">
                              <div className="flex flex-wrap gap-1">
                                {v.selectedOptions.map((id) => {
                                  const label = selectedPoll?.options.find((o) => o.id === id)?.label ?? id
                                  return (
                                    <span key={id} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px]">{label}</span>
                                  )
                                })}
                              </div>
                            </td>
                            {selectedPoll?.allowComment && (
                              <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px]">
                                {v.otherText ? <span className="italic">{truncate(v.otherText, 100)}</span> : <span className="opacity-40">-</span>}
                              </td>
                            )}
                            <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(v.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {votesLastKey && (
                    <button
                      onClick={() => loadVotes(selectedPollId, votesLastKey)}
                      disabled={loadingVotes}
                      className="text-sm text-primary hover:underline disabled:opacity-50"
                    >
                      {loadingVotes ? 'Loading…' : 'Load more'}
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Main FeedbackPage ─────────────────────────────────────────────────── */

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
        {(['issues', 'ratings', 'polls'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'issues' ? 'Issues' : t === 'ratings' ? 'Ratings' : 'Polls'}
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
                      <td className="px-3 py-2 text-xs">{r.issueType ?? '-'}</td>
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
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs" title={r.comment}>{r.comment ? truncate(r.comment) : '-'}</td>
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

      {/* Polls tab */}
      {tab === 'polls' && <PollsTab authFetch={authFetch} />}
    </div>
  )
}
