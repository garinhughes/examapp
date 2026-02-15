/**
 * Weakest-link question selection algorithm.
 *
 * Given a user's historical per-domain stats and their wrong-answer history,
 * build a weighted question set that emphasises weak domains and previously
 * missed questions.
 */

export interface DomainStats {
  total: number
  correct: number
  avgScore: number
  attemptCount: number
}

export interface AnswerRecord {
  questionId: number
  correct: boolean
}

export interface WeightedQuestion {
  id: number
  domain: string
  weight: number
  /** true when the user previously answered this question incorrectly */
  previouslyWrong: boolean
  [key: string]: any // pass-through all original question fields
}

/* ------------------------------------------------------------------ */
/*  Domain weighting                                                   */
/* ------------------------------------------------------------------ */

/**
 * Compute a normalised weight for each domain.
 *
 *  weight = (1 - accuracy) + attemptBoost
 *
 * - Domains with 0 attempts receive a neutral weight (0.5) so they
 *   are still represented but not over-emphasised.
 * - A small attempt boost rewards domains the user has practised
 *   less overall.
 */
export function computeDomainWeights(
  domainStats: Record<string, DomainStats>,
  allDomains: string[]
): Record<string, number> {
  const weights: Record<string, number> = {}

  // max attempts across domains (used for inverse attempt boost)
  const maxAttempts = Math.max(1, ...Object.values(domainStats).map((s) => s.attemptCount))

  for (const domain of allDomains) {
    const stats = domainStats[domain]
    if (!stats || stats.total === 0) {
      // unseen domain — give a neutral-ish weight
      weights[domain] = 0.5
      continue
    }
    const accuracy = stats.correct / stats.total // 0-1
    const inverseAccuracy = 1 - accuracy // higher = weaker
    // small boost for domains with fewer attempts (encourages coverage)
    const attemptBoost = 1 - stats.attemptCount / maxAttempts
    weights[domain] = Math.max(0.05, inverseAccuracy + attemptBoost * 0.25)
  }

  // normalise so weights sum to 1
  const total = Object.values(weights).reduce((s, w) => s + w, 0) || 1
  for (const d of Object.keys(weights)) {
    weights[d] = weights[d] / total
  }
  return weights
}

/* ------------------------------------------------------------------ */
/*  Question selection                                                 */
/* ------------------------------------------------------------------ */

/**
 * Select `count` questions weighted toward the user's weakest domains.
 *
 * Strategy:
 *  1. Previously-wrong questions are selected first (up to 50 % of the set).
 *  2. Remaining slots are filled by sampling domains proportional to their
 *     weight, picking random questions within each domain.
 *  3. Duplicates are avoided.
 *  4. The final list is shuffled.
 */
export function selectWeakestLinkQuestions(
  allQuestions: any[],
  domainWeights: Record<string, number>,
  wrongQuestionIds: Set<number>,
  count: number
): WeightedQuestion[] {
  const selected = new Map<number, WeightedQuestion>()

  // index questions by domain
  const byDomain: Record<string, any[]> = {}
  for (const q of allQuestions) {
    const d = q.domain ?? 'General'
    if (!byDomain[d]) byDomain[d] = []
    byDomain[d].push(q)
  }

  // ── Phase 1: previously wrong questions (up to 50 % of count) ──
  const wrongCap = Math.ceil(count * 0.5)
  const wrongPool = allQuestions.filter((q) => wrongQuestionIds.has(q.id))
  shuffle(wrongPool)
  for (const q of wrongPool) {
    if (selected.size >= wrongCap) break
    selected.set(q.id, { ...q, weight: domainWeights[q.domain ?? 'General'] ?? 0, previouslyWrong: true })
  }

  // ── Phase 2: weighted domain sampling for remaining slots ──
  let remaining = count - selected.size
  const domains = Object.keys(domainWeights)
  let attempts = 0
  const maxAttempts = remaining * 10 // prevent infinite loop

  while (remaining > 0 && attempts < maxAttempts) {
    attempts++
    const domain = weightedPick(domains, domainWeights)
    const pool = byDomain[domain]
    if (!pool || pool.length === 0) continue

    const candidate = pool[Math.floor(Math.random() * pool.length)]
    if (selected.has(candidate.id)) continue

    selected.set(candidate.id, {
      ...candidate,
      weight: domainWeights[domain] ?? 0,
      previouslyWrong: false,
    })
    remaining--
  }

  // ── Phase 3: if we still need more (exhausted weighted sampling), fill from any remaining ──
  if (remaining > 0) {
    for (const q of allQuestions) {
      if (remaining <= 0) break
      if (selected.has(q.id)) continue
      selected.set(q.id, {
        ...q,
        weight: domainWeights[q.domain ?? 'General'] ?? 0,
        previouslyWrong: false,
      })
      remaining--
    }
  }

  const result = Array.from(selected.values())
  shuffle(result)
  return result
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function weightedPick(items: string[], weights: Record<string, number>): string {
  const r = Math.random()
  let cumulative = 0
  for (const item of items) {
    cumulative += weights[item] ?? 0
    if (r <= cumulative) return item
  }
  return items[items.length - 1]
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
