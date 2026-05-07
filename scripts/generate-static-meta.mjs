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
  return shell
    .replace(/<title>[^<]*<\/title>/, `<title>${metaTags.title}</title>`)
    .replace(/<meta name="description"[^>]*>\n?/, '')
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

async function writeListingPage(relPath, metaTags, noscriptContent) {
  const dir = join(DIST, relPath)
  await mkdir(dir, { recursive: true })
  // Links go in <noscript> — invisible to users (JS always runs), crawlable by bots
  const html = injectMeta(metaTags).replace(
    '<div id="root"></div>',
    `<div id="root"></div><noscript>${noscriptContent}</noscript>`
  )
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

// ── Static 404 page ──────────────────────────────────────────────────────────
// CloudFront serves this for 403/404 errors instead of index.html.
// The noindex tag stops Google indexing unknown URLs as homepage duplicates.
// React still hydrates normally, so valid SPA routes (e.g. /pricing) render correctly.

const notFoundHtml = shell
  .replace(/<title>[^<]*<\/title>/, '<title>Page Not Found | certshack</title>')
  .replace(/<meta name="description"[^>]*>\n?/, '')
  .replace('</head>', '  <meta name="robots" content="noindex, nofollow">\n</head>')

await writeFile(join(DIST, '404.html'), notFoundHtml)

// ── Pricing listing page ──────────────────────────────────────────────────────

await writeRoute('pricing', {
  title: 'certshack | Pricing — IT Certification Practice Exams & Skill Labs',
  inject: buildInject({
    description: 'Simple, transparent pricing for certshack practice exams and skill labs. Start free with sample exams, upgrade for full access to all certifications and labs.',
    keywords: 'certshack pricing, certification exam pricing, practice exam subscription, skill lab access',
    canonical: `${SITE_URL}/pricing`,
    ogTitle: 'certshack | Pricing',
    ogDescription: 'Practice exams and skill labs for IT certifications. Start free, upgrade for full access.',
  }),
})

// ── Exams listing page ───────────────────────────────────────────────────────

const allExams = []
for (const file of examFiles) {
  const raw = JSON.parse(await readFile(join(EXAMS_DIR, file), 'utf-8'))
  if (raw.code) allExams.push(raw)
}
allExams.sort((a, b) => (a.title ?? a.code).localeCompare(b.title ?? b.code))

const examListItems = allExams.map(e => {
  const qCount = e.defaultQuestions ?? e.defaultQuestionCount
  return `<li><a href="/exams/${e.code}"><strong>${esc(e.title)} (${e.code})</strong></a> — ${esc(e.provider ?? '')} practice exam${qCount ? `, ${qCount} questions` : ''}, pass mark ${e.passMark ?? 70}%</li>`
}).join('\n      ')

await writeListingPage('exams', {
  title: 'certshack | IT Certification Practice Exams',
  inject: buildInject({
    description: `Practice exams for ${allExams.length} IT certifications including AWS, Azure, CompTIA, and more. Timed mock exams with detailed explanations mapped to exam objectives.`,
    keywords: 'IT certification practice exams, AWS practice exam, Azure practice exam, CompTIA practice exam, cloud certification prep',
    canonical: `${SITE_URL}/exams`,
    ogTitle: 'certshack | IT Certification Practice Exams',
    ogDescription: `Practice exams for ${allExams.length} IT certifications. Timed mock exams with detailed explanations.`,
  }),
}, `<h1>IT Certification Practice Exams</h1><ul>${examListItems}</ul>`)

// ── Skill labs listing page ───────────────────────────────────────────────────

const allLabs = []
for (const file of labFiles) {
  const raw = JSON.parse(await readFile(join(LABS_DIR, file), 'utf-8'))
  if (!Array.isArray(raw)) continue
  for (const lab of raw) { if (lab.id) allLabs.push(lab) }
}
allLabs.sort((a, b) => (a.title ?? a.id).localeCompare(b.title ?? b.id))

const labListItems = allLabs.map(lab => {
  const techList = (lab.technologies ?? []).slice(0, 3).join(', ')
  return `<li><a href="/skill-labs/${lab.id}"><strong>${esc(lab.title)}</strong></a> — ${esc(lab.platform ?? '')} ${esc(lab.difficulty ?? '')} lab${techList ? `. Covers ${esc(techList)}` : ''}</li>`
}).join('\n      ')

await writeListingPage('skill-labs', {
  title: 'certshack | IT Certification Skill Labs',
  inject: buildInject({
    description: `${allLabs.length} hands-on skill labs for AWS, Azure, CompTIA, and more. Interactive scenario-based labs mapped to certification exam objectives.`,
    keywords: 'IT certification skill labs, AWS hands-on labs, Azure labs, CompTIA labs, cloud certification practice',
    canonical: `${SITE_URL}/skill-labs`,
    ogTitle: 'certshack | IT Certification Skill Labs',
    ogDescription: `${allLabs.length} hands-on skill labs for IT certifications. Interactive scenario-based practice.`,
  }),
}, `<h1>IT Certification Skill Labs</h1><ul>${labListItems}</ul>`)

console.log(`[generate-static-meta] wrote ${examCount} exam routes, ${labCount} lab routes, 2 listing pages`)
