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
const SITEMAP_OUT = join(ROOT, 'frontend', 'public', 'sitemap.xml')
const BASE_URL = 'https://certshack.com'

const STATIC_URLS = [
  { loc: `${BASE_URL}/`,          changefreq: 'weekly',  priority: '1.0' },
  { loc: `${BASE_URL}/exams`,     changefreq: 'weekly',  priority: '0.9' },
  { loc: `${BASE_URL}/skill-labs`,changefreq: 'weekly',  priority: '0.9' },
  { loc: `${BASE_URL}/pricing`,   changefreq: 'monthly', priority: '0.8' },
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

function buildXml(staticUrls, labIds) {
  const entries = [
    ...staticUrls.map(({ loc, changefreq, priority }) =>
      `  <url>\n    <loc>${loc}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`
    ),
    ...[...labIds].map((id) =>
      `  <url>\n    <loc>${BASE_URL}/skill-labs/${id}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`
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

const labIds = await collectLabIds()
const xml = buildXml(STATIC_URLS, labIds)
await writeFile(SITEMAP_OUT, xml, 'utf-8')
console.log(`[sitemap] Written ${STATIC_URLS.length + labIds.size} URLs to ${SITEMAP_OUT}`)
