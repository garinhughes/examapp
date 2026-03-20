import { useEffect, useState } from 'react'
import { useAuthFetch } from '../auth/useAuthFetch'
import { useAuth } from '../auth/AuthContext'

interface PollOption {
  id: string
  label: string
}

interface Poll {
  pollId: string
  question: string
  options: PollOption[]
}

interface PollVote {
  selectedOptions: string[]
}

export function PollWidget() {
  const { user } = useAuth()
  const authFetch = useAuthFetch()

  const [poll, setPoll] = useState<Poll | null>(null)
  const [myVote, setMyVote] = useState<PollVote | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) return
    authFetch('/polls/active')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.poll) {
          setPoll(data.poll)
          if (data.myVote) {
            setMyVote(data.myVote)
            setSelected(data.myVote.selectedOptions ?? [])
            setSubmitted(true)
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [user])

  if (!user || !loaded || !poll) return null

  function toggle(id: string) {
    if (submitted) return
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  async function handleSubmit() {
    if (!poll || selected.length === 0 || submitting) return
    setSubmitting(true)
    try {
      await authFetch(`/polls/${poll.pollId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedOptions: selected }),
      })
    } catch {
      // fire & forget
    }
    setSubmitted(true)
    setSubmitting(false)
  }

  return (
    <div className="mt-6 p-5 rounded-lg bg-muted/50 dark:bg-card/5 border border-border/60 dark:border-transparent text-left">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Feedback request</p>
      <p className="font-semibold text-sm mb-3">{poll.question}</p>

      {submitted ? (
        <p className="text-sm text-muted-foreground">
          Thanks for your feedback!{myVote && ' Your response has been recorded.'}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {poll.options.map((opt) => {
              const checked = selected.includes(opt.id)
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggle(opt.id)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    checked
                      ? 'bg-primary text-white border-primary'
                      : 'bg-card border-border text-foreground hover:border-primary/50'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={selected.length === 0 || submitting}
            className="px-4 py-1.5 rounded bg-primary text-white text-sm font-medium disabled:opacity-40 transition-opacity"
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </>
      )}
    </div>
  )
}
