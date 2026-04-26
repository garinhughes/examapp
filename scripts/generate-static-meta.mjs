#!/usr/bin/env node
/**
 * Inject per-route meta tags into static HTML files after `vite build`.
 *
 * For each exam and skill lab, writes a route-specific index.html into dist/
 * with correct <title>, meta description, canonical, OG tags, and JSON-LD.
 * CloudFront serves these directly; social crawlers and non-JS bots get real
 * meta without waiting for React to hydrate.
 *
 * Run after build: node scripts/generate-static-meta.mjs
 * Or via: pnpm --filter frontend build  (calls postbuild hook)
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const EXAMS_DIR = join(ROOT, 'backend', 'data', 'exams')
const LABS_DIR = join(ROOT, 'backend', 'data', 'skill-labs')
const DIST = join(ROOT, 'frontend', 'dist')
const SITE_URL = 'https://certshack.com'
const OG_IMAGE = `${SITE_URL}/og-image.png`

const shell = await readFile(join(DIST, 'index.html'), 'utf-8')

function injectMeta(metaTags) {
  // Replace existing <title> and inject meta before </head>
  return shell
    .replace(/<title>[^<]*<\/title>/, `<title>${metaTags.title}</title>`)
    .replace('</head>', `${metaTags.inject}\n</head>`)
}

function buildInject({ description, keywords, canonical, ogTitle, ogDescription, jsonLd }) {
  return [
    `<meta name="description" content="${esc(description)}">`,
    keywords ? `<meta name="keywords" content="${esc(keywords)}">` : '',
    `<link rel="canonical" href="${canonical}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="certshack">`,
    `<meta property="og:title" content="${esc(ogTitle ?? description)}">`,
    `<meta property="og:description" content="${esc(ogDescription ?? description)}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:image" content="${OG_IMAGE}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(ogTitle ?? description)}">`,
    `<meta name="twitter:description" content="${esc(ogDescription ?? description)}">`,
    `<meta name="twitter:image" content="${OG_IMAGE}">`,
    jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : '',
  ].filter(Boolean).join('\n    ')
}

function esc(str) {
  return String(str ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function writeRoute(relPath, metaTags) {
  const dir = join(DIST, relPath)
  await mkdir(dir, { recursive: true })
  const html = injectMeta(metaTags)
  await writeFile(join(dir, 'index.html'), html)
}

// ── Exams ────────────────────────────────────────────────────────────────────

const examFiles = (await readdir(EXAMS_DIR)).filter(f => f.endsWith('.json'))
let examCount = 0

for (const file of examFiles) {
  const raw = JSON.parse(await readFile(join(EXAMS_DIR, file), 'utf-8'))
  const code = raw.code
  if (!code) continue

  const title = raw.title ?? code
  const provider = raw.provider ?? 'certshack'
  const passMark = raw.passMark ?? 70
  const qCount = raw.defaultQuestions ?? raw.defaultQuestionCount
  const canonical = `${SITE_URL}/exams/${code}`
  const pageTitle = `certshack | ${title} (${code}) Practice Exam`
  const description = `${title} (${code}) practice questions and mock exam. ${qCount ? `${qCount} questions` : 'Questions'} across multiple domains, pass mark ${passMark}%. Every question mapped to a specific exam objective with detailed explanations.`
  const keywords = `${code} practice exam, ${code} mock exam, ${title} practice test, ${code} sample questions, ${code} practice questions, ${provider} certification prep`

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: `${title} (${code}) Practice Exam`,
    description,
    url: canonical,
    provider: { '@type': 'Organization', name: 'certshack', url: SITE_URL },
    educationalCredentialAwarded: title,
    ...(raw.defaultDuration ? { timeRequired: `PT${raw.defaultDuration}M` } : {}),
  })

  await writeRoute(`exams/${code}`, {
    title: pageTitle,
    inject: buildInject({ description, keywords, canonical, ogTitle: pageTitle, ogDescription: description, jsonLd }),
  })
  examCount++
}

// ── Skill Labs ───────────────────────────────────────────────────────────────

const labFiles = (await readdir(LABS_DIR)).filter(f => f.endsWith('.json'))
let labCount = 0

for (const file of labFiles) {
  const raw = JSON.parse(await readFile(join(LABS_DIR, file), 'utf-8'))
  const labs = Array.isArray(raw) ? raw : [raw]

  for (const lab of labs) {
    const labId = lab.id
    if (!labId) continue

    const pageTitle = `certshack | ${lab.title} Skill Lab`
    const techList = (lab.technologies ?? []).slice(0, 4).join(', ')
    const description = `${lab.description ?? lab.title}. Interactive ${lab.platform ?? ''} skill lab. ${lab.difficulty ?? ''} difficulty${techList ? `. Covers ${techList}` : ''}.`.replace(/\s+/g, ' ').trim()
    const keywords = `${lab.title}, ${lab.platform ?? ''} skill lab, hands-on lab, ${lab.difficulty ?? ''} lab${techList ? `, ${techList}` : ''}, certification practice`
    const canonical = `${SITE_URL}/skill-labs/${labId}`

    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'LearningResource',
      name: lab.title,
      description: lab.description ?? lab.title,
      url: canonical,
      educationalLevel: lab.difficulty,
      learningResourceType: 'Simulation',
      provider: { '@type': 'Organization', name: 'certshack', url: SITE_URL },
      ...(lab.technologies?.length ? { teaches: lab.technologies } : {}),
    })

    await writeRoute(`skill-labs/${labId}`, {
      title: pageTitle,
      inject: buildInject({ description, keywords, canonical, ogTitle: pageTitle, ogDescription: description, jsonLd }),
    })
    labCount++
  }
}

console.log(`[generate-static-meta] wrote ${examCount} exam routes, ${labCount} lab routes`)
