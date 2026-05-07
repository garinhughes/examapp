#!/usr/bin/env node
/**
 * Generate frontend/public/sitemap.xml from local skill lab JSON files.
 * Run from the repo root: node scripts/generate-sitemap.js
 * Or via frontend package.json: pnpm sitemap
 */

import { readdir, readFile, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const LABS_DIR = join(ROOT, 'backend', 'data', 'skill-labs')
const EXAMS_DIR = join(ROOT, 'backend', 'data', 'exams')
const SITEMAP_OUT = join(ROOT, 'frontend', 'public', 'sitemap.xml')
const BASE_URL = 'https://certshack.com'

const TODAY = new Date().toISOString().slice(0, 10)

const STATIC_URLS = [
  { loc: `${BASE_URL}/`,          changefreq: 'weekly',  priority: '1.0', lastmod: TODAY },
  { loc: `${BASE_URL}/exams`,     changefreq: 'weekly',  priority: '0.9', lastmod: TODAY },
  { loc: `${BASE_URL}/skill-labs`,changefreq: 'weekly',  priority: '0.9', lastmod: TODAY },
  { loc: `${BASE_URL}/pricing`,   changefreq: 'monthly', priority: '0.8', lastmod: TODAY },
]

async function collectLabIds() {
  const ids = new Set()
  let files
  try {
    files = await readdir(LABS_DIR)
  } catch {
    console.warn(`[sitemap] skill-labs dir not found: ${LABS_DIR}`)
    return ids
  }

  for (const file of files.filter((f) => f.endsWith('.json'))) {
    try {
      const raw = await readFile(join(LABS_DIR, file), 'utf-8')
      const data = JSON.parse(raw)
      const labs = Array.isArray(data) ? data : [data]
      for (const lab of labs) {
        if (lab.id) ids.add(lab.id)
      }
    } catch (err) {
      console.warn(`[sitemap] Failed to parse ${file}:`, err.message)
    }
  }
  return ids
}

async function collectExams() {
  const exams = []
  let files
  try {
    files = await readdir(EXAMS_DIR)
  } catch {
    console.warn(`[sitemap] exams dir not found: ${EXAMS_DIR}`)
    return exams
  }
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    try {
      const raw = JSON.parse(await readFile(join(EXAMS_DIR, file), 'utf-8'))
      const code = raw.code ?? file.replace('.json', '')
      // Use the most recent lastReviewed date across questions, falling back to publishedAt
      const questionDates = (raw.questions ?? [])
        .map(q => q.lastReviewed)
        .filter(Boolean)
        .sort()
      const latestReview = questionDates.at(-1)
      const lastmod = (latestReview ?? raw.publishedAt ?? TODAY).slice(0, 10)
      exams.push({ code, lastmod })
    } catch {
      exams.push({ code: file.replace('.json', ''), lastmod: TODAY })
    }
  }
  return exams
}

function url({ loc, changefreq, priority, lastmod }) {
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`
}

function buildXml(staticUrls, labIds, exams) {
  const entries = [
    ...staticUrls.map((u) => url(u)),
    ...exams.map(({ code, lastmod }) =>
      url({ loc: `${BASE_URL}/exams/${code}`, changefreq: 'weekly', priority: '0.9', lastmod })
    ),
    ...[...labIds].map((id) =>
      url({ loc: `${BASE_URL}/skill-labs/${id}`, changefreq: 'monthly', priority: '0.7', lastmod: TODAY })
    ),
  ]

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n')
}

const [labIds, exams] = await Promise.all([collectLabIds(), collectExams()])
const xml = buildXml(STATIC_URLS, labIds, exams)
await writeFile(SITEMAP_OUT, xml, 'utf-8')
console.log(`[sitemap] Written ${STATIC_URLS.length + exams.length + labIds.size} URLs to ${SITEMAP_OUT}`)
