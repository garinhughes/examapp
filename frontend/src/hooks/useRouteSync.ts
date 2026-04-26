import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useExam } from '@/exam/ExamContext'
import type { AppRoute } from '@/exam/types'

const INTERNAL_ONLY_ROUTES = new Set<AppRoute>([])

function pathnameToRoute(pathname: string): AppRoute | null {
  switch (pathname) {
    case '/privacy':
      return 'privacy'
    case '/terms':
      return 'terms'
    case '/refund':
      return 'refund'
    case '/':
    case '/home':
      return 'home'
    case '/exams':
      return 'practice'
    case '/skill-labs':
      return 'skill-labs'
    case '/analytics':
      // Legacy fallback. /analytics now redirects in App.tsx to /exams/:lastCode/history
      // — this entry just keeps server-rendered/initial state coherent if anything bypasses it.
      return 'analytics'
    case '/pricing':
      return 'pricing'
    case '/account':
      return 'account'
    case '/diagrams':
      return 'diagrams'
    case '/basket':
      return 'basket'
    case '/admin':
      return 'admin'
    case '/metrics':
      return 'metrics'
    case '/feedback':
      return 'feedback'
    default: {
      if (pathname.startsWith('/skill-labs/')) {
        const rest = pathname.slice('/skill-labs/'.length)
        if (!rest) return null
        const parts = rest.split('/')
        const labId = parts[0]
        if (!labId) return null
        // /skill-labs/{id}/attempt/{mode} → runner
        if (parts.length >= 2 && parts[1] === 'attempt') {
          const mode = parts[2] === 'casual' ? 'casual' : 'timed'
          return `skill-lab:${labId}:${mode}` as AppRoute
        }
        // /skill-labs/{id} → detail page
        return `skill-lab-detail:${labId}` as AppRoute
      }
      return null
    }
  }
}

const ROUTE_TO_PATHNAME: Partial<Record<AppRoute, string>> = {
  // 'home' is handled separately: /exams/:examCode when selected, / when not
  practice: '/exams',
  'skill-labs': '/skill-labs',
  analytics: '/analytics',
  pricing: '/pricing',
  account: '/account',
  diagrams: '/diagrams',
  basket: '/basket',
  admin: '/admin',
  metrics: '/metrics',
  feedback: '/feedback',
  privacy: '/privacy',
  terms: '/terms',
  refund: '/refund',
}

/**
 * Two-way sync between browser URL and ExamContext route state.
 * Mount once inside ExamApp (which is always inside BrowserRouter).
 */
export function useRouteSync(): void {
  const { route, setRoute, selected, setSelected } = useExam()
  const location = useLocation()
  const navigate = useNavigate()
  const isInitialMount = useRef(true)

  // URL → state: when the user navigates directly or uses back/forward
  useEffect(() => {
    const pathname = location.pathname
    if (pathname.startsWith('/exams/')) {
      const rest = pathname.slice('/exams/'.length)

      // /exams/:code (no sub-path) — exam landing page (dev-guide §16 / 15.2)
      if (rest && !rest.includes('/')) {
        if (rest !== selected) setSelected(rest)
        if (route !== 'exam-landing') setRoute('exam-landing')
        return
      }

      // /exams/:code/history — per-exam history page (dev-guide §16 / 15.3)
      const histMatch = rest.match(/^([^/]+)\/history$/)
      if (histMatch) {
        const code = histMatch[1]
        if (code !== selected) setSelected(code)
        if (route !== 'exam-history') setRoute('exam-history')
        return
      }

      // /exams/:code/attempt/:attemptId — per-attempt review (dev-guide §16 / 15.4)
      const reviewMatch = rest.match(/^([^/]+)\/attempt\/([^/]+)$/)
      if (reviewMatch) {
        const [, code] = reviewMatch
        if (code !== selected) setSelected(code)
        if (route !== 'exam-attempt-review') setRoute('exam-attempt-review')
        return
      }

      // /exams/:code/attempt — live runner / result (dev-guide §16 / 15.5)
      const attemptMatch = rest.match(/^([^/]+)\/attempt$/)
      if (attemptMatch) {
        const code = attemptMatch[1]
        if (code !== selected) setSelected(code)
        if (route !== 'home') setRoute('home')
        return
      }
    }
    const mapped = pathnameToRoute(pathname)
    if (mapped && mapped !== route) {
      setRoute(mapped)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  // State → URL: when internal state changes (e.g. sidebar click, hero button).
  // Skip on initial mount - the URL→state effect above owns the initial sync.
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    if (INTERNAL_ONLY_ROUTES.has(route)) return

    // skill-lab-detail: /skill-labs/:labId
    if (route.startsWith('skill-lab-detail:')) {
      const labId = route.slice('skill-lab-detail:'.length)
      const target = `/skill-labs/${labId}`
      if (location.pathname !== target) navigate(target, { replace: true })
      return
    }
    // skill-lab runner: /skill-labs/:labId/attempt/:mode
    if (route.startsWith('skill-lab:')) {
      const parts = route.slice('skill-lab:'.length)
      const lastColon = parts.lastIndexOf(':')
      const labId = lastColon > 0 ? parts.slice(0, lastColon) : parts
      const mode = lastColon > 0 ? parts.slice(lastColon + 1) : 'timed'
      const target = `/skill-labs/${labId}/attempt/${mode}`
      if (location.pathname !== target) navigate(target, { replace: true })
      return
    }

    // exam-landing: /exams/:examCode; bail to /exams if nothing selected
    if (route === 'exam-landing') {
      const target = selected ? `/exams/${selected}` : '/exams'
      if (location.pathname !== target) navigate(target, { replace: true })
      return
    }

    // home: runner lives at /exams/:examCode/attempt (dev-guide §16 / 15.5)
    if (route === 'home') {
      const target = selected ? `/exams/${selected}/attempt` : '/'
      if (location.pathname !== target) navigate(target, { replace: true })
      return
    }

    // exam-history: URL is /exams/:examCode/history
    if (route === 'exam-history') {
      const target = selected ? `/exams/${selected}/history` : '/exams'
      if (location.pathname !== target) navigate(target, { replace: true })
      return
    }

    // exam-attempt-review: URL derives attemptId from window.location so we don't
    // need an extra piece of ExamContext state; we just keep the current pathname.
    if (route === 'exam-attempt-review') return

    const target = ROUTE_TO_PATHNAME[route]
    if (target && location.pathname !== target) {
      navigate(target, { replace: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, selected])
}
