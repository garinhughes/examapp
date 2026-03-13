export function markLabCompleted(labId: string) {
  const stored = JSON.parse(localStorage.getItem('skill-labs-completed') || '[]')
  if (!stored.includes(labId)) {
    stored.push(labId)
    localStorage.setItem('skill-labs-completed', JSON.stringify(stored))
  }
}

export function getBookmarkedLabs(): Set<string> {
  const stored: string[] = JSON.parse(localStorage.getItem('skill-labs-bookmarked') || '[]')
  return new Set(stored)
}

export function toggleBookmark(labId: string): Set<string> {
  const stored: string[] = JSON.parse(localStorage.getItem('skill-labs-bookmarked') || '[]')
  const idx = stored.indexOf(labId)
  if (idx >= 0) {
    stored.splice(idx, 1)
  } else {
    stored.push(labId)
  }
  localStorage.setItem('skill-labs-bookmarked', JSON.stringify(stored))
  return new Set(stored)
}
