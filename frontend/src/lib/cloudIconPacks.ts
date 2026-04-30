import mermaid from 'mermaid'
import type { IconifyJSON } from '@iconify/types'
import { apiUrl } from '@/apiBase'
import { icons as logosIconsJson } from '@iconify-json/logos'

const loadedPacks = new Set<string>()
const KNOWN_PROVIDERS = ['aws', 'azure', 'gcp', 'general'] as const

// Register the bundled logos pack (docker, mysql, linux, terraform, etc.) once at module load.
// Uses prefix 'logos' so diagrams reference icons as icon:logos:docker-icon etc.
mermaid.registerIconPacks([{ name: logosIconsJson.prefix, icons: logosIconsJson }])

/**
 * Detects provider prefixes referenced in a mermaid diagram string.
 * e.g. "icon:aws:ec2" and "icon:logos:docker-icon" → ['aws']
 * ('logos' is already bundled; 'aws'/'azure'/'gcp'/'general' are fetched from S3)
 */
export function detectProviders(diagramCode: string): string[] {
  const found = new Set<string>()
  const matches = diagramCode.matchAll(/icon:([a-z]+):/g)
  for (const m of matches) {
    if ((KNOWN_PROVIDERS as readonly string[]).includes(m[1])) found.add(m[1])
  }
  return [...found]
}

/**
 * Fetches and registers iconify packs for the given providers with mermaid.
 * Each pack is loaded at most once per session.
 */
export async function ensureCloudIconPacks(providers: string[]): Promise<void> {
  const toLoad = providers.filter(p => !loadedPacks.has(p))
  if (!toLoad.length) return

  const results = await Promise.allSettled(
    toLoad.map(async (p) => {
      const res = await fetch(apiUrl(`/images/content?key=icons/${p}/pack.json`))
      if (!res.ok) throw new Error(`Failed to load ${p} icon pack: ${res.status}`)
      return res.json() as Promise<IconifyJSON>
    })
  )

  const packs: { name: string; icons: IconifyJSON }[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      packs.push({ name: r.value.prefix, icons: r.value })
      loadedPacks.add(toLoad[i])
    } else {
      console.warn(`[cloudIconPacks] ${r.reason}`)
    }
  })

  if (packs.length) mermaid.registerIconPacks(packs)
}
