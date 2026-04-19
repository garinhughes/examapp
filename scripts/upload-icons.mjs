#!/usr/bin/env node
/**
 * Upload AWS/Azure/GCP SVG icons to S3 and generate mermaid-compatible iconify packs.
 *
 * Usage:
 *   aws-sso-login certshack
 *   node scripts/upload-icons.mjs [--dry-run] [--provider aws|azure|gcp]
 *
 * Outputs per provider:
 *   icons/{provider}/{name}.svg   — individual SVG (flat, no category)
 *   icons/{provider}/pack.json    — iconify-format pack for mermaid.registerIconPacks()
 *
 * Bucket: examapp-images-809472479011
 */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { execSync } from 'node:child_process'

const BUCKET = 'examapp-images-809472479011'
const ICONS_BASE = '/home/garin/Pictures/certshack/icons'
const TMP = '/tmp/examapp-icons-upload'

const isDryRun = process.argv.includes('--dry-run')
const onlyProvider = process.argv.includes('--provider')
  ? process.argv[process.argv.indexOf('--provider') + 1]
  : null

// ── SVG parsing ──────────────────────────────────────────────────────────────

function extractIconifyData(svgContent) {
  const viewBoxMatch = svgContent.match(/viewBox="0 0 ([\d.]+)\s+([\d.]+)"/)
  const widthMatch = svgContent.match(/\s(?:width)="([\d.]+)(?:px)?"/)
  const w = viewBoxMatch ? parseFloat(viewBoxMatch[1]) : widthMatch ? parseFloat(widthMatch[1]) : 24
  const h = viewBoxMatch ? parseFloat(viewBoxMatch[2]) : w

  // Extract everything between the opening <svg ...> and closing </svg>
  const bodyMatch = svgContent.match(/<svg[^>]*>([\s\S]*)<\/svg>\s*$/)
  const body = bodyMatch ? bodyMatch[1].trim() : ''
  return { body, width: Math.round(w), height: Math.round(h) }
}

// ── Name normalisation ────────────────────────────────────────────────────────

function normalise(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

// For AWS we include the category in the key only when a name collision exists.
// Pass the full path so we can extract the category directory.
function awsIconName(filePath) {
  return normalise(basename(filePath, '.svg'))
}

function awsIconNameWithCategory(filePath) {
  const parts = filePath.split('/')
  // …/aws_icons/{Category}/{Name}.svg
  const category = parts[parts.length - 2]
  const name = basename(filePath, '.svg')
  return `${normalise(name)}-${normalise(category)}`
}

function azureIconName(filePath) {
  // Strip leading numeric prefix: "00195-icon-service-Maintenance-Configuration" → "maintenance-configuration"
  const raw = basename(filePath, '.svg').replace(/^\d+-icon-service-/, '')
  return normalise(raw)
}

function gcpIconName(filePath) {
  return normalise(basename(filePath, '.svg'))
}

// ── Walk helpers ──────────────────────────────────────────────────────────────

function walkSvgs(dir) {
  const results = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      results.push(...walkSvgs(full))
    } else if (extname(entry).toLowerCase() === '.svg') {
      results.push(full)
    }
  }
  return results
}

// ── Provider definitions ──────────────────────────────────────────────────────

const PROVIDERS = {
  aws: {
    srcDir: join(ICONS_BASE, 'aws_icons'),
    nameFn: awsIconName,
    fallbackNameFn: awsIconNameWithCategory, // used when base name collides
    prefix: 'aws',
  },
  azure: {
    srcDir: join(ICONS_BASE, 'azure_icons/Azure_Public_Service_Icons/Icons'),
    nameFn: azureIconName,
    prefix: 'azure',
  },
  gcp: {
    srcDir: join(ICONS_BASE, 'gcp_icons/svg'),
    nameFn: gcpIconName,
    prefix: 'gcp',
  },
}

// ── Main ──────────────────────────────────────────────────────────────────────

function addIcon(pack, tmpDir, name, filePath) {
  const content = readFileSync(filePath, 'utf8')
  const { body, width, height } = extractIconifyData(content)
  pack.icons[name] = { body, width, height }
  const dest = join(tmpDir, `${name}.svg`)
  try { symlinkSync(filePath, dest) } catch { /* already exists */ }
}

function processProvider(key, { srcDir, nameFn, fallbackNameFn, prefix }) {
  console.log(`\n=== ${key.toUpperCase()} ===`)
  const svgFiles = walkSvgs(srcDir)
  console.log(`  Found ${svgFiles.length} SVG files`)

  const seen = new Map() // name → source path
  const collisions = [] // names that collided
  const pack = { prefix, icons: {} }
  const tmpDir = join(TMP, key)

  mkdirSync(tmpDir, { recursive: true })

  for (const filePath of svgFiles) {
    const name = nameFn(filePath)
    if (!name) continue

    if (!seen.has(name)) {
      seen.set(name, filePath)
      addIcon(pack, tmpDir, name, filePath)
      continue
    }

    // Collision — if provider has a fallback namer, use category-suffixed keys for both
    if (fallbackNameFn) {
      const existingPath = seen.get(name)
      if (!collisions.includes(name)) {
        // Re-key the first entry with its category suffix
        delete pack.icons[name]
        const existingSymlink = join(tmpDir, `${name}.svg`)
        try { rmSync(existingSymlink) } catch { /* fine */ }
        const firstName = fallbackNameFn(existingPath)
        addIcon(pack, tmpDir, firstName, existingPath)
        collisions.push(name)
        console.log(`  ↔ collision "${name}": using "${firstName}" + "${fallbackNameFn(filePath)}"`)
      }
      addIcon(pack, tmpDir, fallbackNameFn(filePath), filePath)
    } else {
      // Azure/GCP: identical duplicates, silently skip
    }
  }

  console.log(`  → ${Object.keys(pack.icons).length} unique icons`)

  // Write pack.json
  const packPath = join(TMP, `${key}-pack.json`)
  writeFileSync(packPath, JSON.stringify(pack))
  console.log(`  → pack.json written (${Math.round(Buffer.byteLength(JSON.stringify(pack)) / 1024)}KB)`)

  if (isDryRun) {
    console.log(`  [dry-run] would sync ${tmpDir} → s3://${BUCKET}/icons/${key}/`)
    console.log(`  [dry-run] would upload pack.json → s3://${BUCKET}/icons/${key}/pack.json`)
    return
  }

  // Upload SVGs via s3 sync
  console.log(`  Syncing SVGs → s3://${BUCKET}/icons/${key}/...`)
  execSync(
    `aws s3 sync "${tmpDir}" "s3://${BUCKET}/icons/${key}/" --exclude "*.json" --profile certshack`,
    { stdio: 'inherit' }
  )

  // Upload pack.json
  console.log(`  Uploading pack.json...`)
  execSync(
    `aws s3 cp "${packPath}" "s3://${BUCKET}/icons/${key}/pack.json" --content-type application/json --profile certshack`,
    { stdio: 'inherit' }
  )

  console.log(`  ✓ ${key} done`)
}

// ── Run ───────────────────────────────────────────────────────────────────────

rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })

const targets = onlyProvider ? { [onlyProvider]: PROVIDERS[onlyProvider] } : PROVIDERS

if (onlyProvider && !PROVIDERS[onlyProvider]) {
  console.error(`Unknown provider: ${onlyProvider}. Use: aws, azure, gcp`)
  process.exit(1)
}

for (const [key, config] of Object.entries(targets)) {
  processProvider(key, config)
}

console.log('\n✓ All done.')
if (isDryRun) console.log('  Re-run without --dry-run to actually upload.')
