import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuthFetch } from '../auth/useAuthFetch'

interface Props {
  contentType: 'question' | 'answer' | 'explanation' | 'lab'
  contentId: string
  examCode?: string
  provider?: string
  showPauseNotice?: boolean
  onClose: () => void
}

const ISSUE_TYPES: Record<Props['contentType'], string[]> = {
  question: [
    'Incorrect question wording',
    'Wrong answer marked correct',
    'Correct answer marked wrong',
    "Doesn't match vendor documentation",
    'Out of date',
    'Typo / grammar',
    'Rendering issue',
    'Other',
  ],
  answer: [
    'Wrong answer marked correct',
    'Correct answer marked wrong',
    "Doesn't match vendor documentation",
    'Out of date',
    'Other',
  ],
  explanation: [
    'Incorrect explanation',
    "Doesn't match vendor documentation",
    'Out of date',
    'Incomplete',
    'Typo / grammar',
    'Other',
  ],
  lab: [
    'Incorrect steps / solution',
    "Doesn't match vendor documentation",
    'Out of date',
    'Rendering issue',
    'Typo / grammar',
    'Other',
  ],
}

export function ReportIssueModal({ contentType, contentId, examCode, provider, showPauseNotice, onClose }: Props) {
  const authFetch = useAuthFetch()
  const [issueType, setIssueType] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const options = ISSUE_TYPES[contentType]
  const canSubmit = issueType !== ''

  async function handleSubmit() {
    if (!issueType) {
      setError('Please select an issue type.')
      return
    }
    if (description.trim().length < 10) {
      setError('Please provide at least 10 characters of description.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await authFetch('/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType, contentId, examCode, issueType, description: description.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as any).message ?? 'Something went wrong. Please try again.')
      } else {
        setSubmitted(true)
        setTimeout(onClose, 2000)
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card p-6 rounded max-w-lg w-full mx-4">
        {submitted ? (
          <div className="text-center py-4">
            <div className="text-lg font-semibold mb-1">Thanks for the report</div>
            <div className="text-sm text-muted-foreground">We'll look into it shortly.</div>
          </div>
        ) : (
          <>
            <h3 className="text-lg font-semibold mb-1">Report an issue</h3>
            {showPauseNotice && (
              <div className="mb-3 px-3 py-2 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-400">
                ⏸ Paused whilst you complete this report
              </div>
            )}
            <p className="text-sm text-muted-foreground mb-4">
              {provider && <span>Provider · {provider}</span>}
              {examCode && <span>{provider ? ' · ' : ''}Exam · {examCode}</span>}
              {(provider || examCode) && ' · '}
              {contentType === 'question' ? 'Question' : contentType === 'lab' ? 'Lab' : contentType} ID: {contentId}
            </p>

            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Issue type</label>
              <select
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
                disabled={submitting}
              >
                <option value="">— Select issue type —</option>
                {options.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div className="mb-1">
              <label className="block text-sm font-medium mb-1">Additional details</label>
              <textarea
                className="w-full rounded border border-border bg-background p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                rows={4}
                placeholder="Describe the issue — e.g. the explanation is incorrect because…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                disabled={submitting}
              />
            </div>
            <div className="text-xs text-muted-foreground text-right mb-3">
              {description.length}/2000
            </div>

            {error && (
              <div className="text-sm text-red-500 mb-3">{error}</div>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                className="px-3 py-1 rounded-md bg-accent text-muted-foreground hover:bg-accent/80 transition text-sm"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition text-sm disabled:opacity-50"
                onClick={handleSubmit}
                disabled={submitting || !canSubmit}
              >
                {submitting ? 'Sending…' : 'Submit'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
