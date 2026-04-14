const KEY = 'visitor_id'

/** Get or create a stable visitor UUID stored in localStorage. */
export function getOrCreateVisitorId(): string {
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return 'visitor-fallback'
  }
}
