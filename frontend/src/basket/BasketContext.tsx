/**
 * BasketContext -- shopping basket state with localStorage persistence.
 *
 * Only one plan can be in the basket at a time.
 * Provides a suggestion to upgrade from Pro to Pro Plus for £1 more.
 */

import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react'
import type { CatalogProduct } from '../hooks/useEntitlements'
import { useAuth } from '../auth/AuthContext'

export interface BasketItem {
  product: CatalogProduct
  addedAt: number
}

export interface BasketSuggestion {
  message: string
  suggestedProductId: string
  saving: number
}

interface BasketState {
  items: BasketItem[]
  add: (product: CatalogProduct) => boolean
  remove: (productId: string) => void
  clear: () => void
  has: (productId: string) => boolean
  switchTo: (product: CatalogProduct) => void
  total: number
  suggestions: BasketSuggestion[]
  lastError: string | null
  clearError: () => void
  itemCount: number
}

const BasketCtx = createContext<BasketState | null>(null)

// Basket is namespaced per user sub (or "guest" for unauthenticated) so User A's
// basket can never leak into User B's session on the same device. Guest baskets
// are migrated to the user namespace on first sign-in.
const BASKET_KEY_PREFIX = 'certshack:basket:'
const GUEST_KEY = `${BASKET_KEY_PREFIX}guest`
const LEGACY_KEY = 'certshack:basket'
const storageKeyFor = (sub: string | null | undefined) => `${BASKET_KEY_PREFIX}${sub || 'guest'}`

function loadFromStorage(key: string): BasketItem[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function saveToStorage(key: string, items: BasketItem[]) {
  localStorage.setItem(key, JSON.stringify(items))
}

export function BasketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userSub = user?.sub ?? null
  const currentKey = storageKeyFor(userSub)
  const prevSubRef = useRef<string | null | undefined>(undefined)

  // Migrate legacy un-namespaced basket on first mount (existing users)
  useEffect(() => {
    try {
      const legacy = localStorage.getItem(LEGACY_KEY)
      if (legacy) {
        // Attribute the legacy basket to the current session (user or guest)
        if (!localStorage.getItem(currentKey)) localStorage.setItem(currentKey, legacy)
        localStorage.removeItem(LEGACY_KEY)
      }
    } catch {}
    // Intentionally run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [items, setItems] = useState<BasketItem[]>(() => loadFromStorage(currentKey))
  const [lastError, setLastError] = useState<string | null>(null)

  // When the user identity changes, re-scope the basket. On first sign-in we
  // migrate the guest basket into the user namespace (preserves "add → sign in"
  // flow). On sign-out we clear in-memory state; we don't touch other users' keys.
  useEffect(() => {
    const prev = prevSubRef.current
    if (prev === undefined) {
      prevSubRef.current = userSub
      return
    }
    if (prev === userSub) return

    // Guest → signed-in: migrate guest basket to user namespace
    if (!prev && userSub) {
      try {
        const guest = localStorage.getItem(GUEST_KEY)
        if (guest && !localStorage.getItem(currentKey)) {
          localStorage.setItem(currentKey, guest)
        }
        localStorage.removeItem(GUEST_KEY)
      } catch {}
    }

    // Load whatever belongs to the new identity
    setItems(loadFromStorage(currentKey))
    setLastError(null)
    prevSubRef.current = userSub
  }, [userSub, currentKey])

  const add = useCallback((product: CatalogProduct): boolean => {
    // Guard: duplicate product
    if (items.some((i) => i.product.productId === product.productId)) {
      setLastError('This item is already in your basket.')
      return false
    }

    // Only one plan at a time
    if (items.length > 0) {
      setLastError('Only one plan can be in your basket at a time. Remove the current item first.')
      return false
    }

    const next = [{ product, addedAt: Date.now() }]
    setItems(next)
    saveToStorage(currentKey, next)
    setLastError(null)
    return true
  }, [items, currentKey])

  const remove = useCallback((productId: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.product.productId !== productId)
      saveToStorage(currentKey, next)
      setLastError(null)
      return next
    })
  }, [currentKey])

  const clear = useCallback(() => {
    setItems([])
    localStorage.removeItem(currentKey)
    setLastError(null)
  }, [currentKey])

  const has = useCallback((productId: string) => items.some((i) => i.product.productId === productId), [items])

  const total = useMemo(() => items.reduce((sum, i) => {
    // Use discounted price if available
    const price = i.product.discountedPriceGBP ?? i.product.priceGBP
    return sum + price
  }, 0), [items])

  const suggestions = useMemo((): BasketSuggestion[] => {
    const result: BasketSuggestion[] = []

    const hasPro = items.some((i) => i.product.productId === 'sub:pro')

    // Suggest upgrading to Pro Plus for just £2 more
    if (hasPro) {
      result.push({
        message: 'Upgrade to Pro Plus for just £2/month more - unlock full access to all skill labs.',
        suggestedProductId: 'sub:pro-plus',
        saving: 0,
      })
    }

    return result
  }, [items])

  const switchTo = useCallback((product: CatalogProduct) => {
    const next = [{ product, addedAt: Date.now() }]
    setItems(next)
    saveToStorage(currentKey, next)
    setLastError(null)
  }, [currentKey])

  const clearError = useCallback(() => setLastError(null), [])

  return (
    <BasketCtx.Provider value={{ items, add, remove, clear, has, switchTo, total, suggestions, lastError, clearError, itemCount: items.length }}>
      {children}
    </BasketCtx.Provider>
  )
}

export function useBasket(): BasketState {
  const ctx = useContext(BasketCtx)
  if (!ctx) throw new Error('useBasket must be used within BasketProvider')
  return ctx
}
