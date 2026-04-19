import mermaid from 'mermaid'
import { apiUrl } from '@/apiBase'

const loadedPacks = new Set<string>()
const KNOWN_PROVIDERS = ['aws', 'azure', 'gcp'] as const

/**
 * Detects provider prefixes referenced in a mermaid diagram string.
 * e.g. "icon:aws:ec2" and "icon:azure:blob-storage" → ['aws', 'azure']
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
      return res.json() as Promise<{ prefix: string; icons: Record<string, unknown> }>
    })
  )

  const packs: { name: string; icons: object }[] = []
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
