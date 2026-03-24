#!/usr/bin/env node
/**
 * publishSkillLabs.ts — CLI tool to publish skill lab JSON definitions
 * to S3 and update the DynamoDB skill-labs index.
 *
 * Usage:
 *   npx ts-node --esm scripts/publishSkillLabs.ts --all              # publish all labs
 *   npx ts-node --esm scripts/publishSkillLabs.ts --all --dry-run    # preview, don't upload
 *   npx ts-node --esm scripts/publishSkillLabs.ts <labId>            # publish one lab
 *
 * Environment:
 *   AWS_PROFILE / AWS_REGION (defaults to eu-west-1)
 *   SKILL_LAB_S3_BUCKET  (auto-detected if not set)
 *   SKILL_LAB_INDEX_TABLE (defaults to examapp-skill-labs-index)
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { publishLab, getLabIndex } from '../src/services/skillLabStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LABS_DIR = path.resolve(__dirname, '../data/skill-labs')

interface LabDef {
  id: string
  title?: string
  type?: string
  platform?: string
  category?: string
  difficulty?: string
  version?: number
  [key: string]: any
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const publishAll = args.includes('--all')
  const labId = args.find((a) => !a.startsWith('--'))

  if (!publishAll && !labId) {
    console.error('Usage: publishSkillLabs.ts <labId> | --all [--dry-run]')
    process.exit(1)
  }

  // Scan per-provider files and merge into one array
  const files = await fs.readdir(LABS_DIR)
  const allLabs: LabDef[] = (await Promise.all(
    files.filter((f) => f.endsWith('.json')).map(async (f) => {
      const raw = await fs.readFile(path.join(LABS_DIR, f), 'utf-8')
      return JSON.parse(raw) as LabDef[]
    })
  )).flat()

  let labs: LabDef[]
  if (publishAll) {
    labs = allLabs
  } else {
    const match = allLabs.find((l) => l.id === labId)
    if (!match) {
      console.error(`Lab "${labId}" not found in ${LABS_DIR}`)
      process.exit(1)
    }
    labs = [match]
  }

  console.log(`Publishing ${labs.length} skill lab(s)${dryRun ? ' (DRY RUN)' : ''}...\n`)

  for (const lab of labs) {
    const version = lab.version ?? 1
    const labJson = JSON.stringify(lab, null, 2)

    // Check current index
    const current = await getLabIndex(lab.id).catch(() => null)
    const currentVersion = current?.version ?? 0

    console.log(`  ${lab.id}:`)
    console.log(`    title:           ${lab.title ?? '(untitled)'}`)
    console.log(`    type:            ${lab.type ?? '(unknown)'}`)
    console.log(`    platform:        ${lab.platform ?? 'AWS'}`)
    console.log(`    timeLimit:       ${lab.timeLimit ?? '(none)'}`)
    console.log(`    version (file):  ${version}`)
    console.log(`    version (index): ${currentVersion || '(not published)'}`)

    if (dryRun) {
      console.log(`    → DRY RUN: would upload to labs/${lab.id}.json\n`)
      continue
    }

    const entry = await publishLab(lab.id, labJson, {
      version,
      title: lab.title,
      type: lab.type,
      platform: lab.platform,
      category: lab.category,
      difficulty: lab.difficulty,
      timeLimit: lab.timeLimit,
      technologies: lab.technologies,
      showcase: lab.showcase,
      showcaseOrder: lab.showcaseOrder,
    })
    console.log(`    → published: s3VersionId=${entry.s3VersionId}`)
    console.log(`    → index updated: version=${entry.version} publishedAt=${entry.publishedAt}\n`)
  }

  console.log('Done.')
}

main().catch((err) => {
  console.error('Publish failed:', err)
  process.exit(1)
})
