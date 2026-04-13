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
        const labId = pathname.slice('/skill-labs/'.length)
        if (labId) return `skill-lab-detail:${labId}`
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
    // /exams/:examCode — exam setup / in-progress / review
    if (pathname.startsWith('/exams/')) {
      const examCode = pathname.slice('/exams/'.length)
      if (examCode && !examCode.includes('/')) {
        if (examCode !== selected) setSelected(examCode)
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

    // skill-lab-detail and skill-lab runner both live at /skill-labs/:labId
    if (route.startsWith('skill-lab-detail:')) {
      const labId = route.slice('skill-lab-detail:'.length)
      const target = `/skill-labs/${labId}`
      if (location.pathname !== target) navigate(target, { replace: true })
      return
    }
    if (route.startsWith('skill-lab:')) {
      const parts = route.slice('skill-lab:'.length)
      const lastColon = parts.lastIndexOf(':')
      const labId = lastColon > 0 ? parts.slice(0, lastColon) : parts
      const target = `/skill-labs/${labId}`
      if (location.pathname !== target) navigate(target, { replace: true })
      return
    }

    // home: URL is /exams/:examCode when an exam is selected, / otherwise
    if (route === 'home') {
      const target = selected ? `/exams/${selected}` : '/'
      if (location.pathname !== target) navigate(target, { replace: true })
      return
    }

    const target = ROUTE_TO_PATHNAME[route]
    if (target && location.pathname !== target) {
      navigate(target, { replace: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, selected])
}
