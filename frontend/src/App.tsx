import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { ExamProvider } from './exam/ExamContext'
import { SkillLabProvider } from './skill-labs/SkillLabContext'
import ExamApp from './exam/ExamApp'
import VerifyPage from './components/VerifyPage'
import LoginPage from './components/LoginPage'
import { usePageTracking } from './hooks/usePageTracking'
import { useAuth } from './auth/AuthContext'
import { useAuthFetch } from './auth/useAuthFetch'
import { apiUrl } from './apiBase'

function ExamAppWrapped() {
  return (
    <ExamProvider>
      <SkillLabProvider>
        <ExamApp />
      </SkillLabProvider>
    </ExamProvider>
  )
}

/**
 * Legacy /analytics redirect (dev-guide §16 / 15.8).
 * Sidebar entry was removed; analytics content now lives at /exams/:code/history.
 * Resolves the most-recently-attempted exam from /attempts?summary=1 and replaces
 * the URL. Falls back to /exams when the user has no finished attempts (or is signed out).
 */
function AnalyticsRedirect() {
  const { user, loading } = useAuth()
  const authFetch = useAuthFetch()
  const [target, setTarget] = useState<string | null>(null)

  useEffect(() => {
    if (loading) return
    if (!user) { setTarget('/exams'); return }
    let cancelled = false
    ;(async () => {
      try {
        const r = await authFetch(apiUrl('/attempts?summary=1'))
        if (!r.ok) { if (!cancelled) setTarget('/exams'); return }
        const d = await r.json()
        const list: Array<{ examCode: string; lastAttemptAt: string | null }> = Array.isArray(d?.summaries) ? d.summaries : []
        const sorted = list
          .filter((s) => !!s.lastAttemptAt)
          .sort((a, b) => String(b.lastAttemptAt).localeCompare(String(a.lastAttemptAt)))
        if (cancelled) return
        setTarget(sorted[0]?.examCode ? `/exams/${sorted[0].examCode}/history` : '/exams')
      } catch {
        if (!cancelled) setTarget('/exams')
      }
    })()
    return () => { cancelled = true }
  }, [loading, user, authFetch])

  if (target === null) return null
  return <Navigate to={target} replace />
}

export default function App() {
  usePageTracking()

  return (
    <Routes>
      <Route path="/verify/:token" element={<VerifyPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ExamAppWrapped />} />
      <Route path="/exams" element={<ExamAppWrapped />} />
      <Route path="/exams/:examCode" element={<ExamAppWrapped />} />
      <Route path="/exams/:examCode/history" element={<ExamAppWrapped />} />
      <Route path="/exams/:examCode/attempt/:attemptId" element={<ExamAppWrapped />} />
      <Route path="/exams/:examCode/attempt" element={<ExamAppWrapped />} />
      <Route path="/skill-labs" element={<ExamAppWrapped />} />
      <Route path="/skill-labs/:labId" element={<ExamAppWrapped />} />
      <Route path="/analytics" element={<AnalyticsRedirect />} />
      <Route path="/pricing" element={<ExamAppWrapped />} />
      <Route path="/account" element={<ExamAppWrapped />} />
      <Route path="/diagrams" element={<ExamAppWrapped />} />
      <Route path="/basket" element={<ExamAppWrapped />} />
      <Route path="/admin" element={<ExamAppWrapped />} />
      <Route path="/metrics" element={<ExamAppWrapped />} />
      <Route path="/feedback" element={<ExamAppWrapped />} />
      <Route path="/privacy" element={<ExamAppWrapped />} />
      <Route path="/terms" element={<ExamAppWrapped />} />
      <Route path="/refund" element={<ExamAppWrapped />} />
      <Route path="*" element={<ExamAppWrapped />} />
    </Routes>
  )
}
