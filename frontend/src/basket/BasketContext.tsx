/**
 * BasketContext -- shopping basket state with localStorage persistence.
 *
 * Only one plan can be in the basket at a time.
 * Provides a suggestion to upgrade from Pro to Pro Plus for £1 more.
 */

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import type { CatalogProduct } from '../hooks/useEntitlements'

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

const STORAGE_KEY = 'certshack:basket'

function loadFromStorage(): BasketItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function saveToStorage(items: BasketItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export function BasketProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BasketItem[]>(loadFromStorage)
  const [lastError, setLastError] = useState<string | null>(null)

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
    saveToStorage(next)
    setLastError(null)
    return true
  }, [items])

  const remove = useCallback((productId: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.product.productId !== productId)
      saveToStorage(next)
      setLastError(null)
      return next
    })
  }, [])

  const clear = useCallback(() => {
    setItems([])
    localStorage.removeItem(STORAGE_KEY)
    setLastError(null)
  }, [])

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
        message: 'Upgrade to Pro Plus for just £2/month more — unlock full access to all skill labs.',
        suggestedProductId: 'sub:pro-plus',
        saving: 0,
      })
    }

    return result
  }, [items])

  const switchTo = useCallback((product: CatalogProduct) => {
    const next = [{ product, addedAt: Date.now() }]
    setItems(next)
    saveToStorage(next)
    setLastError(null)
  }, [])

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
