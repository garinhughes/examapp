import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { apiUrl } from '@/apiBase'
import { useAuth } from '@/auth/AuthContext'
import { useEntitlements } from '@/hooks/useEntitlements'

interface Props {
  onClose: () => void
}

type UsagePlan = 'light' | 'heavy'

export function RequestExamModal({ onClose }: Props) {
  const { user } = useAuth()
  const { products, discountActive } = useEntitlements()
  const proProduct = products.find((p) => p.productId === 'sub:pro')
  const proBasePence = proProduct?.priceGBP
  const proDiscountPence = discountActive ? proProduct?.discountedPriceGBP : undefined
  const proEffectivePence = proDiscountPence != null ? proDiscountPence : proBasePence
  const formatGBP = (pence: number) => {
    const pounds = pence / 100
    return pounds % 1 === 0 ? `£${pounds}` : `£${pounds.toFixed(2)}`
  }
  const proPriceLabel = proEffectivePence != null ? formatGBP(proEffectivePence) : null

  const [email, setEmail] = useState(user?.email ?? '')
  const [exam, setExam] = useState('')
  const [usage, setUsage] = useState<UsagePlan | null>(null)
  // Honeypot — must stay empty. Name chosen to avoid browser/password-manager autofill.
  // If a bot fills it, the backend silently drops the submission.
  const [examRefCode, setExamRefCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function handleSubmit() {
    const trimmedEmail = email.trim()
    const trimmedExam = exam.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.')
      return
    }
    if (trimmedExam.length === 0) {
      setError('Please tell us which exam you want.')
      return
    }
    if (!usage) {
      setError('Please tell us roughly how many questions you plan to take.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(apiUrl('/exam-requests'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, exam: trimmedExam, usage, exam_ref_code: examRefCode }),
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
            <div className="text-lg font-semibold mb-1">Thanks for the request</div>
            <div className="text-sm text-muted-foreground">We'll be in touch when it's available.</div>
          </div>
        ) : (
          <>
            <h3 className="text-lg font-semibold mb-1">Request an exam</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Tell us which certification you'd like added and we'll let you know when it's available.
            </p>

            {/* Honeypot — hidden from real users, attractive to naive bots. Name chosen
                to avoid browser/password-manager autofill heuristics. */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' }}>
              <label>
                Exam reference code (leave blank)
                <input
                  type="text"
                  name="exam_ref_code"
                  tabIndex={-1}
                  autoComplete="off"
                  value={examRefCode}
                  onChange={(e) => setExamRefCode(e.target.value)}
                />
              </label>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Your email</label>
              <input
                type="email"
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                maxLength={254}
              />
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Which exam?</label>
              <textarea
                className="w-full rounded border border-border bg-background p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                rows={3}
                placeholder="e.g. CompTIA Security+ (SY0-701)"
                value={exam}
                onChange={(e) => setExam(e.target.value)}
                maxLength={500}
                disabled={submitting}
              />
              <div className="text-xs text-muted-foreground text-right mt-1">{exam.length}/500</div>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">How many questions do you plan to take?</label>
              <div className="space-y-1.5">
                {([
                  { value: 'light' as const, label: '0–40 questions', hint: 'Available free' },
                  { value: 'heavy' as const, label: '40+ questions', hint: proPriceLabel ? `${proPriceLabel}/mo · cancel anytime` : 'Paid plan' },
                ]).map((opt) => {
                  const checked = usage === opt.value
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-2.5 p-2.5 rounded border cursor-pointer transition-colors ${checked ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setUsage(opt.value)}
                        disabled={submitting}
                        className="mt-0.5 accent-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{opt.label}</div>
                        <div className="text-xs text-muted-foreground">{opt.hint}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>

            {error && <div className="text-sm text-red-500 mb-3">{error}</div>}

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
                disabled={submitting}
              >
                {submitting ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
