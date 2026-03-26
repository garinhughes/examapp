import { Helmet } from 'react-helmet-async'
import type { AppRoute } from '@/exam/types'

const SITE_URL = 'https://certshack.com'
const OG_IMAGE = `${SITE_URL}/og-image.png`

interface RouteMeta {
  title: string
  description: string
  path: string
  noindex?: boolean
}

const META: Partial<Record<AppRoute, RouteMeta>> = {
  home: {
    title: 'certshack | IT Certification Practice Exams & Skill Labs',
    description: 'Practice exams and hands-on skill labs for AWS, Azure, GCP and more. Timed or casual mode with per-question explanations and analytics.',
    path: '/',
  },
  practice: {
    title: 'certshack | Practice Exams',
    description: 'Browse and attempt timed or casual practice exams for IT certifications including AWS SAA, AZ-900, GCP ACE and more.',
    path: '/exams',
  },
  'skill-labs': {
    title: 'certshack | Skill Labs',
    description: 'Hands-on interactive skill labs to practise real-world IT tasks. Build the practical skills examiners test.',
    path: '/skill-labs',
  },
  pricing: {
    title: 'certshack | Pricing',
    description: 'Simple, transparent pricing for certshack practice exams and skill labs. Start free.',
    path: '/pricing',
  },
  analytics: {
    title: 'certshack | Analytics',
    description: 'Your personal exam analytics and performance trends.',
    path: '/analytics',
    noindex: true,
  },
  account: {
    title: 'certshack | Account',
    description: 'Manage your certshack account settings and achievements.',
    path: '/account',
    noindex: true,
  },
}

interface Props {
  route: AppRoute
}

export function PageMeta({ route }: Props) {
  const base = route.startsWith('skill-lab:') ? META['skill-labs'] : META[route]
  if (!base) return null

  const canonical = `${SITE_URL}${base.path}`

  return (
    <Helmet>
      <title>{base.title}</title>
      <meta name="description" content={base.description} />
      {base.noindex && <meta name="robots" content="noindex, nofollow" />}
      <link rel="canonical" href={canonical} />
      <meta property="og:title" content={base.title} />
      <meta property="og:description" content={base.description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={OG_IMAGE} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={base.title} />
      <meta name="twitter:description" content={base.description} />
      <meta name="twitter:image" content={OG_IMAGE} />
    </Helmet>
  )
}
