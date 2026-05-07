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
    title: 'certshack | IT Certification Practice Exams & Skill Labs',
    description: 'Free practice exams and interactive skill labs for AWS, Azure, and GCP certifications. Timed or casual mode, per-question explanations, domain analytics, and hands-on CLI & IAM labs to build real-world cloud engineering skills.',
    path: '/',
    keywords: 'practice exams, AWS certification, Azure certification, GCP certification, skill labs, cloud certification practice, IT exam prep, SAA-C03, AZ-900, hands-on labs, certification study',
  },
  practice: {
    title: 'certshack | Practice Exams',
    description: 'Browse and attempt timed or casual practice exams for IT certifications including AWS SAA-C03, CLF-C02, SCS-C03, CompTIA PenTest+ PT0-003, and more. Per-domain scoring and detailed explanations.',
    path: '/exams',
    keywords: 'practice exams, AWS SAA-C03, AWS CLF-C02, AWS SCS-C03, CompTIA PenTest+, PT0-003, timed exam, certification prep',
  },
  'skill-labs': {
    title: 'certshack | Skill Labs',
    description: 'Interactive skill labs to practise real-world cloud tasks. Simulated AWS CLI, IAM policy debugging, architecture diagnosis, and more. Build the practical skills that examiners and employers test.',
    path: '/skill-labs',
    keywords: 'skill labs, hands-on labs, AWS CLI practice, IAM policy lab, cloud skills, interactive labs, certification lab',
  },
  pricing: {
    title: 'certshack | Pricing',
    description: 'Simple, transparent pricing for certshack practice exams and skill labs. Start free with sample exams, upgrade for full access to all certifications and labs.',
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
  basket: {
    title: 'certshack | Basket',
    description: '',
    path: '/basket',
    noindex: true,
  },
  diagrams: {
    title: 'certshack | Architecture Diagrams',
    description: '',
    path: '/diagrams',
    noindex: true,
  },
  feedback: {
    title: 'certshack | Feedback',
    description: '',
    path: '/feedback',
    noindex: true,
  },
  metrics: {
    title: 'certshack | Metrics',
    description: '',
    path: '/metrics',
    noindex: true,
  },
  admin: {
    title: 'certshack | Admin',
    description: '',
    path: '/admin',
    noindex: true,
  },
  'not-found': {
    title: 'Page Not Found | certshack',
    description: '',
    path: '',
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
            text: 'certshack offers practice exams and skill labs for AWS (SAA-C03, CLF-C02, SCS-C03), CompTIA (PenTest+ PT0-003), Anthropic (CCA-F), and more, with new certifications added regularly.',
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

interface ExamMetaProps {
  code: string
  title?: string
  provider?: string
  passMark?: number
  defaultQuestions?: number
  questionCount?: number
  defaultDuration?: number
}

interface LabMetaProps {
  title: string
  description: string
  platform: string
  difficulty: string
  technologies: string[]
}

interface Props {
  route: AppRoute
  examMeta?: ExamMetaProps | null
  labMeta?: LabMetaProps | null
}

export function PageMeta({ route, examMeta, labMeta }: Props) {
  // Exam landing pages get fully dynamic meta
  if (route === 'exam-landing' && examMeta) {
    const code = examMeta.code
    const title = examMeta.title ?? code
    const provider = examMeta.provider ?? 'certshack'
    const passMark = examMeta.passMark ?? 70
    const qCount = examMeta.questionCount ?? examMeta.defaultQuestions
    const pageTitle = `${code} Practice Exam | certshack`
    const description = `${title} (${code}) practice questions and mock exam. ${qCount ? `${qCount} questions` : 'Questions'} across multiple domains, pass mark ${passMark}%. Timed or casual mode — every question mapped to a specific exam objective with detailed explanations.`
    const keywords = `${code} practice exam, ${code} mock exam, ${title} practice test, ${code} sample questions, ${code} practice questions, ${provider} certification prep, ${code} exam questions`
    const canonical = `${SITE_URL}/exams/${code}`

    const courseJsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: `${title} (${code}) Practice Exam`,
      description,
      url: canonical,
      provider: {
        '@type': 'Organization',
        name: 'certshack',
        url: SITE_URL,
      },
      educationalCredentialAwarded: title,
      ...(examMeta.defaultDuration ? { timeRequired: `PT${examMeta.defaultDuration}M` } : {}),
    })

    return (
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={description} />
        <meta name="keywords" content={keywords} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="certshack" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={OG_IMAGE} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={OG_IMAGE} />
        <script type="application/ld+json">{courseJsonLd}</script>
      </Helmet>
    )
  }

  // Skill lab detail pages get per-lab dynamic meta once the lab data has loaded
  if (route.startsWith('skill-lab-detail:') && labMeta) {
    const labId = route.slice('skill-lab-detail:'.length)
    const pageTitle = `${labMeta.title} Skill Lab | certshack`
    const techList = labMeta.technologies.slice(0, 4).join(', ')
    const description = `${labMeta.description} Interactive ${labMeta.platform} skill lab. ${labMeta.difficulty} difficulty${techList ? ` — covering ${techList}` : ''}.`
    const keywords = `${labMeta.title}, ${labMeta.platform} skill lab, hands-on lab, ${labMeta.difficulty} lab${techList ? `, ${techList}` : ''}, certification practice`
    const canonical = `${SITE_URL}/skill-labs/${labId}`

    const learningResourceJsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'LearningResource',
      name: labMeta.title,
      description: labMeta.description,
      url: canonical,
      educationalLevel: labMeta.difficulty,
      learningResourceType: 'Simulation',
      provider: {
        '@type': 'Organization',
        name: 'certshack',
        url: SITE_URL,
      },
      ...(labMeta.technologies.length > 0 ? { teaches: labMeta.technologies } : {}),
    })

    return (
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={description} />
        <meta name="keywords" content={keywords} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="certshack" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={OG_IMAGE} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={OG_IMAGE} />
        <script type="application/ld+json">{learningResourceJsonLd}</script>
      </Helmet>
    )
  }

  const base = route.startsWith('skill-lab:') || route.startsWith('skill-lab-detail:') ? META['skill-labs'] : META[route]
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
