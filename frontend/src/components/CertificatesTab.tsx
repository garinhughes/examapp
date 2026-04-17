import { useState, useRef, useEffect } from 'react'
import { Lock } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useAuthFetch } from '../auth/useAuthFetch'
import { useGamification } from '../gamification/GamificationContext'
import { useEntitlements, isPaidTier } from '../hooks/useEntitlements'
import CertificateOptions from './CertificateOptions'
import CertificatePreview, { type CertOptions } from './CertificatePreview'

type Phase = 'options' | 'generating' | 'preview'

export default function CertificatesTab() {
  const { user } = useAuth()
  const authFetch = useAuthFetch()
  const { state } = useGamification()
  const { tier } = useEntitlements()

  const [phase, setPhase] = useState<Phase>('options')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState('')
  const [certId, setCertId] = useState('')
  const [issuedAt, setIssuedAt] = useState('')
  const [options, setOptions] = useState<CertOptions | null>(null)
  const [downloading, setDownloading] = useState(false)

  const certRef = useRef<HTMLDivElement>(null)

  const [currentUsername, setCurrentUsername] = useState<string | null>(null)
  const [examTitles, setExamTitles] = useState<Record<string, string>>({})

  useEffect(() => {
    authFetch('/username')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.username) setCurrentUsername(data.username) })
      .catch(() => {})

    // Fetch exam catalog to get full titles for the certificate
    fetch('/exams')
      .then((r) => r.ok ? r.json() : [])
      .then((exams: Array<{ code: string; title?: string }>) => {
        const map: Record<string, string> = {}
        for (const e of exams) { if (e.title) map[e.code] = e.title }
        setExamTitles(map)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Paywall
  if (!isPaidTier(tier)) {
    return (
      <div className="p-6 rounded-xl border border-border bg-card text-center">
        <div className="flex justify-center mb-3">
          <Lock className="w-10 h-10 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-1">Certificates are a Pro feature</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Upgrade to Pro or Pro Plus to generate and download personalised achievement certificates.
        </p>
        <a
          href="/pricing"
          className="inline-block px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/80 transition-colors"
        >
          View Plans
        </a>
      </div>
    )
  }

  const handleGenerate = async (opts: CertOptions) => {
    setLoading(true)
    setError(null)
    setOptions(opts)
    setPhase('generating')

    try {
      const res = await authFetch('/certificates/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: currentUsername ?? user?.name ?? 'User',
          ...opts,
          passedExams: state.passedExams,
          labsCompleted: state.labsCompleted.length,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to generate certificate.' }))
        throw new Error(err.message)
      }

      const data = await res.json()
      setToken(data.token)
      setCertId(data.certId)
      setIssuedAt(data.issuedAt)
      setPhase('preview')
    } catch (err: any) {
      setError(err.message || 'Failed to generate certificate.')
      setPhase('options')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadPDF = async () => {
    if (!certRef.current) return
    setDownloading(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const { jsPDF } = await import('jspdf')
      const canvas = await html2canvas(certRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          // html2canvas can't parse oklch() used by Tailwind CSS variables.
          // The certificate uses only inline hex styles so removing all
          // stylesheets from the clone has no visual effect.
          clonedDoc.querySelectorAll('link[rel="stylesheet"], style').forEach((el) => el.remove())
        },
      })
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const imgData = canvas.toDataURL('image/png')
      pdf.addImage(imgData, 'PNG', 0, 0, 297, 210)
      pdf.save(`certshack-certificate-${certId}.pdf`)
    } catch (err) {
      console.error('PDF generation failed:', err)
      setError('Failed to generate PDF. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const handleShareLinkedIn = () => {
    const params = new URLSearchParams({
      startTask: 'CERTIFICATION_NAME',
      name: 'certshack Achievement',
      organizationName: 'certshack',
      issueYear: String(new Date(issuedAt).getFullYear()),
      issueMonth: String(new Date(issuedAt).getMonth() + 1),
      certUrl: `https://certshack.com/verify/${token}`,
      certId,
    })
    window.open(`https://www.linkedin.com/profile/add?${params}`, '_blank')
  }

  const handleReset = () => {
    setPhase('options')
    setToken('')
    setCertId('')
    setIssuedAt('')
    setOptions(null)
    setError(null)
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {phase === 'options' && (
        <CertificateOptions
          passedExams={state.passedExams}
          labsCompleted={state.labsCompleted.length}
          onGenerate={handleGenerate}
          loading={loading}
        />
      )}

      {phase === 'generating' && (
        <div className="p-6 rounded-xl border border-border bg-card text-center">
          <div className="text-4xl mb-3 animate-pulse">🎓</div>
          <p className="text-sm text-muted-foreground">Generating your certificate…</p>
        </div>
      )}

      {phase === 'preview' && options && (
        <>
          {/* Scrollable certificate container */}
          <div className="rounded-lg border border-border overflow-x-auto">
            <CertificatePreview
              ref={certRef}
              displayName={currentUsername ?? user?.name ?? 'User'}
              certId={certId}
              token={token}
              issuedAt={issuedAt}
              options={options}
              data={{
                passedExams: state.passedExams,
                labsCompleted: state.labsCompleted.length,
              }}
              examTitles={examTitles}
            />
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleDownloadPDF}
              disabled={downloading}
              className="flex-1 min-w-[140px] py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/80 transition-colors disabled:opacity-50"
            >
              {downloading ? 'Generating PDF…' : '📥 Download PDF'}
            </button>
            <button
              onClick={handleShareLinkedIn}
              className="flex-1 min-w-[140px] py-2.5 rounded-lg font-semibold text-sm text-white transition-colors"
              style={{ backgroundColor: '#0A66C2' }}
            >
              🔗 Share on LinkedIn
            </button>
            <button
              onClick={handleReset}
              className="flex-1 min-w-[140px] py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              🔄 Generate New
            </button>
          </div>
        </>
      )}
    </div>
  )
}
