import { useState } from 'react'
import { useAuthFetch } from '../auth/useAuthFetch'

const CATEGORIES = [
  'General',
  'Content (i.e. new exam / lab)',
  'Website bug or suggestion',
  'Billing/Pricing',
  'Other',
]

export function UserFeedbackPage() {
  const authFetch = useAuthFetch()
  const [category, setCategory] = useState(CATEGORIES[0])
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setStatus('submitting')
    setErrorMsg(null)

    try {
      const res = await authFetch('/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, message: message.trim() }),
      })
      if (res.ok) {
        setStatus('success')
      } else {
        const data = await res.json().catch(() => ({}))
        setErrorMsg(data.message ?? 'Something went wrong. Please try again.')
        setStatus('error')
      }
    } catch {
      setErrorMsg('Network error. Please check your connection and try again.')
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center space-y-3">
        <div className="text-3xl font-semibold">Thank you!</div>
        <p className="text-muted-foreground">
          Your feedback has been sent. We read every message and it helps us prioritize what to build next.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto py-8 px-4 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Share your feedback</h1>
        <p className="text-muted-foreground">
          We genuinely appreciate hearing from the community. Whether it's a feature idea, a content
          request, or something that's frustrating you - we want to know. A few examples of things
          people ask us:
        </p>
        <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 pl-1">
          <li>"I'd like a skill lab for a particular AWS service or domain"</li>
          <li>"When is the new version of exam X coming?"</li>
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="feedback-category">
            Category <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <select
            id="feedback-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="feedback-message">
            Message <span className="text-destructive">*</span>
          </label>
          <textarea
            id="feedback-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            rows={6}
            maxLength={2000}
            placeholder="Tell us what's on your mind…"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
          />
          <p className="text-xs text-muted-foreground text-right">{message.length}/2000</p>
        </div>

        {errorMsg && (
          <p className="text-sm text-destructive">{errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={status === 'submitting' || !message.trim()}
          className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 transition-opacity hover:opacity-90"
        >
          {status === 'submitting' ? 'Sending…' : 'Send feedback'}
        </button>
      </form>
    </div>
  )
}
