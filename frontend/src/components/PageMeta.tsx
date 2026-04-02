import { Helmet } from 'react-helmet-async'
import type { AppRoute } from '@/exam/types'

const SITE_URL = 'https://certshack.com'
const OG_IMAGE = `${SITE_URL}/og-image.png`

interface RouteMeta {
  title: string
  description: string
  path: string
  noindex?: boolean
  keywords?: string
}

const META: Partial<Record<AppRoute, RouteMeta>> = {
  home: {
    title: 'certshack - IT Certification Practice Exams & Hands-On Skill Labs | AWS, Azure, GCP',
    description: 'Free practice exams and interactive skill labs for AWS, Azure, and GCP certifications. Timed or casual mode, per-question explanations, domain analytics, and hands-on CLI & IAM labs to build real-world cloud engineering skills.',
    path: '/',
    keywords: 'practice exams, AWS certification, Azure certification, GCP certification, skill labs, cloud certification practice, IT exam prep, SAA-C03, AZ-900, hands-on labs, certification study',
  },
  practice: {
    title: 'certshack - Practice Exams for AWS, Azure & GCP Certifications',
    description: 'Browse and attempt timed or casual practice exams for IT certifications including AWS SAA-C03, CLF-C02, DVA-C02, SOA-C02, SCS-C03, and Azure AZ-900. Per-domain scoring and detailed explanations.',
    path: '/exams',
    keywords: 'practice exams, AWS SAA-C03, AWS CLF-C02, AWS DVA-C02, AWS SOA-C02, AWS SCS-C03, AZ-900, timed exam, certification prep',
  },
  'skill-labs': {
    title: 'certshack - Hands-On Skill Labs for Cloud Certifications',
    description: 'Interactive skill labs to practise real-world cloud tasks. Simulated AWS CLI, IAM policy debugging, architecture diagnosis, and more. Build the practical skills that examiners and employers test.',
    path: '/skill-labs',
    keywords: 'skill labs, hands-on labs, AWS CLI practice, IAM policy lab, cloud skills, interactive labs, certification lab',
  },
  pricing: {
    title: 'certshack - Pricing | Free & Premium Plans',
    description: 'Simple, transparent pricing for certshack practice exams and skill labs. Start free with sample exams, upgrade for full access to all certifications and labs.',
    path: '/pricing',
  },
  analytics: {
    title: 'certshack - Your Exam Analytics & Performance',
    description: 'Your personal exam analytics and performance trends.',
    path: '/analytics',
    noindex: true,
  },
  account: {
    title: 'certshack - Account Settings',
    description: 'Manage your certshack account settings and achievements.',
    path: '/account',
    noindex: true,
  },
}

/* JSON-LD structured data for the homepage */
const HOME_JSONLD = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      name: 'certshack',
      url: SITE_URL,
      description: 'IT certification practice exams and hands-on skill labs for AWS, Azure, and GCP.',
      potentialAction: {
        '@type': 'SearchAction',
        target: `${SITE_URL}/exams?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'Organization',
      name: 'certshack',
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
      sameAs: [],
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Are practice exams enough to pass a certification?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Practice exams are one of the most effective study methods, but combining them with hands-on skill labs and official documentation produces the best results.',
          },
        },
        {
          '@type': 'Question',
          name: 'How do skill labs help me become a better engineer?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Skill labs simulate real-world tasks like debugging IAM policies, running AWS CLI commands, and diagnosing architecture issues - building practical muscle memory beyond exam knowledge.',
          },
        },
        {
          '@type': 'Question',
          name: 'Which certifications do you cover?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'certshack offers practice exams and skill labs for AWS (SAA-C03, CLF-C02, DVA-C02, SOA-C02, SCS-C03) and Azure (AZ-900), with new certifications added regularly.',
          },
        },
        {
          '@type': 'Question',
          name: 'Is there a free tier?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. You can start with free practice exams. Premium tiers unlock additional exams, skill labs, and detailed analytics.',
          },
        },
      ],
    },
  ],
})

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
      {base.keywords && <meta name="keywords" content={base.keywords} />}
      {base.noindex && <meta name="robots" content="noindex, nofollow" />}
      <link rel="canonical" href={canonical} />
      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="certshack" />
      <meta property="og:title" content={base.title} />
      <meta property="og:description" content={base.description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={OG_IMAGE} />
      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={base.title} />
      <meta name="twitter:description" content={base.description} />
      <meta name="twitter:image" content={OG_IMAGE} />
      {/* JSON-LD structured data (homepage only) */}
      {route === 'home' && (
        <script type="application/ld+json">{HOME_JSONLD}</script>
      )}
    </Helmet>
  )
}
