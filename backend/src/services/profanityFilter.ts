/* ------------------------------------------------------------------
 *  Profanity filter with leet-speak normalisation
 *
 *  Strategy
 *  1. Normalise the input:
 *     – lower-case
 *     – map common number/symbol substitutions → letters
 *     – collapse repeated characters (e.g. "ffuuuck" → "fuck")
 *     – strip non-alpha characters so "f.u.c.k" is caught
 *  2. Check the normalised string against a comprehensive word list
 *     using substring matching (so "xassholex" is still caught).
 *  3. Also check each word boundary segment for exact matches to
 *     reduce false positives on short words.
 * ------------------------------------------------------------------ */

/** Leet-speak / substitution map */
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '2': 'z',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'g',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '@': 'a',
  '$': 's',
  '!': 'i',
  '|': 'i',
  '+': 't',
  '(': 'c',
  '<': 'c',
  '^': 'a',
  '¥': 'y',
  '€': 'e',
  '£': 'l',
}

/** Normalise a string: leet-decode, lower-case, collapse repeats, strip non-alpha */
function normalise(raw: string): string {
  let s = raw.toLowerCase()

  // Replace leet characters
  s = [...s].map((ch) => LEET[ch] ?? ch).join('')

  // Strip anything that isn't a-z
  s = s.replace(/[^a-z]/g, '')

  // Collapse runs of the same character (e.g. "fuuuck" → "fuck")
  s = s.replace(/(.)\1+/g, '$1')

  return s
}

/**
 * Generate multiple normalisation variants for ambiguous leet substitutions.
 * E.g. '4' could be 'a' or 'u' in different contexts, '3' could be 'e'.
 */
const LEET_AMBIGUOUS: Record<string, string[]> = {
  '4': ['a', 'u'],  // f4ck → fuck or fack
  '0': ['o', 'u'],  // f0ck → fock or fuck
  '1': ['i', 'l'],  // 1ame → iame or lame
  '3': ['e', 'a'],  // 3ss → ess or ass
}

function normaliseVariants(raw: string): string[] {
  const base = normalise(raw)
  const variants = new Set<string>([base])

  // For each ambiguous leet char in the original, try alternate mappings
  const lower = raw.toLowerCase()
  for (const [ch, alts] of Object.entries(LEET_AMBIGUOUS)) {
    if (!lower.includes(ch)) continue
    // Generate a variant with the alternate mapping
    for (const alt of alts) {
      let s = lower
      // Replace all occurrences of this leet char with the alternate
      s = s.split(ch).join(alt)
      // Now apply the standard normalisation pipeline (strip non-alpha, collapse)
      s = [...s].map((c) => LEET[c] ?? c).join('')
      s = s.replace(/[^a-z]/g, '')
      s = s.replace(/(.)\1+/g, '$1')
      variants.add(s)
    }
  }

  return [...variants]
}

/**
 * Allow-list: words that contain bad-word substrings but are legitimate.
 * Stored post-normalisation (lowercase, collapsed).
 */
const ALLOW_LIST = new Set([
  'scunthorpe', 'therapist', 'classic', 'clasic', 'asassin', 'asasin',
  'cocksure', 'cocket', 'cocktail', 'cockatil', 'hancock', 'peacock',
  'penistone', 'arsenal', 'basement', 'grape', 'drape',
  'analyze', 'analyst', 'analysis', 'canal', 'manslaughter',
  'shitake', 'cumulative', 'document', 'circumstance',
  'title', 'butter', 'button', 'shuttle', 'smother',
  'dickens', 'dickenson',
])

/**
 * Comprehensive bad-word list.
 *
 * Words are stored **post-normalisation** (lower-case, no repeats).
 * Substring matching is used for longer words (≥4 chars).
 * Shorter words are only matched at word boundaries to avoid
 * false positives (e.g. "ass" inside "assassin" is acceptable in
 * a gaming username context — but "ass" as a standalone word is not).
 */
const BAD_WORDS: string[] = [
  // ── English slurs & profanity ──
  'fuck', 'shit', 'cunt', 'bitch', 'whore', 'slut',
  'dick', 'cock', 'penis', 'vagina', 'anus',
  'bastard', 'wanker', 'tosser', 'twat', 'prick',
  'arsehole', 'asshole', 'ashole',
  'nigger', 'nigga', 'negro', 'coon', 'darkie', 'darky',
  'chink', 'gook', 'spic', 'wetback', 'beaner',
  'kike', 'yid', 'heeb',
  'fag', 'faggot', 'dyke',
  'retard', 'retarded', 'spaz', 'spastic',
  'tranny', 'shemale',
  'motherfucker', 'motherfucking',
  'cocksucker', 'cocksuck',
  'bullshit', 'horseshit', 'dipshit', 'shithead', 'shitface',
  'fuckface', 'fuckhead', 'fucker', 'fucking',
  'dumbass', 'jackass', 'fatass', 'badass', 'smartass',
  'blowjob', 'handjob', 'rimjob',
  'dildo', 'vibrator',
  'cum', 'jizz', 'semen', 'spunk', 'ejaculate',
  'porn', 'porno', 'pornography',
  'rape', 'rapist', 'molest', 'molester', 'pedophile', 'paedophile',
  'incest', 'bestiality',
  'nazi', 'hitler', 'holocaust',
  'jihad', 'terrorist',
  'suicide', 'killmyself',
  'tits', 'boobs', 'titties',
  'hentai', 'cameltoe',
  'queef', 'smegma',
  'goddamn', 'goddam',

  // ── Combined / common evasions (post-normalisation) ──
  'fuk', 'fuc', 'phuck', 'phuk',
  'fak', 'fack', 'facker',   // 4→a normalisation of fuck
  'sht', 'sh1t',
  'cnt',
  'dik', 'd1ck',
  'btch',
  'niga', 'n1ga', 'niger',   // collapsed double-g variants
  'ashole', 'arsehole',
  'stfu', 'gtfo',

  // ── Scunthorpe-safe: some words that should NOT be in this list ──
  // (we rely on the length-gated matching below to keep "ass" from
  //  matching "classic", "ambassador" etc.)
]

/** Words that must only be matched as a whole token (≤3 chars) to avoid false positives */
const SHORT_WORD_SET = new Set(BAD_WORDS.filter((w) => w.length <= 3))

/** Longer bad words matched via substring */
const LONG_WORDS = BAD_WORDS.filter((w) => w.length > 3)

/**
 * Returns true if the username contains profanity.
 */
export function containsProfanity(username: string): boolean {
  const variants = normaliseVariants(username)

  // Check allow-list: if the entire normalised username is an allowed word, skip
  const primaryNormalised = normalise(username)
  if (ALLOW_LIST.has(primaryNormalised)) return false

  for (const normalised of variants) {
    // 1. Substring check for longer words
    for (const word of LONG_WORDS) {
      if (normalised.includes(word)) {
        // Double-check that the match isn't inside an allowed word
        if (ALLOW_LIST.has(normalised)) continue
        return true
      }
    }
  }

  // 2. Exact-token check for short words
  //    Split the ORIGINAL input on non-alpha boundaries and normalise each token
  const tokens = username.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean)
  for (const rawTok of tokens) {
    const tokVariants = normaliseVariants(rawTok)
    for (const tok of tokVariants) {
      if (SHORT_WORD_SET.has(tok)) return true
    }
  }

  // 3. Also check if the entire normalised string exactly matches a short word
  for (const v of variants) {
    if (SHORT_WORD_SET.has(v)) return true
  }

  return false
}

/* ------------------------------------------------------------------
 *  Username validation rules
 * ------------------------------------------------------------------ */

/** Allowed: 3-20 chars, alphanumeric + underscores + hyphens, must start with a letter */
const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]{2,19}$/

export interface UsernameValidation {
  valid: boolean
  reason?: string
}

export function validateUsername(username: string): UsernameValidation {
  if (!username || typeof username !== 'string') {
    return { valid: false, reason: 'Username is required.' }
  }

  const trimmed = username.trim()

  if (trimmed.length < 3) {
    return { valid: false, reason: 'Username must be at least 3 characters.' }
  }
  if (trimmed.length > 20) {
    return { valid: false, reason: 'Username must be 20 characters or fewer.' }
  }
  if (!USERNAME_REGEX.test(trimmed)) {
    return { valid: false, reason: 'Username must start with a letter and contain only letters, numbers, underscores, or hyphens.' }
  }
  if (containsProfanity(trimmed)) {
    return { valid: false, reason: 'That username is not allowed.' }
  }

  return { valid: true }
}
