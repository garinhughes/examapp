/**
 * BasketContext -- shopping basket state with localStorage persistence.
 *
 * Provides add/remove/clear + smart suggestions (e.g. nudge to subscribe
 * when buying multiple individual exams).
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

    const hasSubscription = items.some((i) => i.product.kind === 'subscription')
    const hasBundle = items.some((i) => i.product.kind === 'bundle')
    const examItems = items.filter((i) => i.product.kind === 'exam')

    // Prevent mixing a subscription with other items in the same order
    if (product.kind === 'subscription') {
      if (items.length > 0) {
        setLastError('A subscription cannot be purchased together with other items. Use the suggestion to switch instead.')
        return false
      }
    }

    // Prevent adding an exam when a subscription is already present
    if (product.kind === 'exam') {
      if (hasSubscription) {
        setLastError('You already have an All-Access subscription in your basket.')
        return false
      }
      if (hasBundle) {
        setLastError('Remove the exam pack from your basket before adding individual exams.')
        return false
      }
      // Prevent duplicate same exam code
      const examCode = product.examCodes?.[0] ?? product.productId.replace(/^exam:/, '')
      if (examItems.some((i) => (i.product.examCodes?.[0] ?? i.product.productId.replace(/^exam:/, '')) === examCode)) {
        setLastError('This exam is already in your basket.')
        return false
      }
    }

    // Prevent adding a bundle if there are individual exams or a subscription
    if (product.kind === 'bundle') {
      if (hasSubscription) {
        setLastError('You already have an All-Access subscription in your basket.')
        return false
      }
      if (examItems.length > 0) {
        setLastError('Remove individual exams before adding an exam pack.')
        return false
      }
      // If bundle lists specific examCodes, prevent overlaps
      if (product.examCodes && product.examCodes.length > 0) {
        const overlap = items.some((i) => i.product.kind === 'exam' && i.product.examCodes?.some((c) => product.examCodes!.includes(c)))
        if (overlap) {
          setLastError('This pack contains an exam already in your basket.')
          return false
        }
      }
    }

    const next = [...items, { product, addedAt: Date.now() }]
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

  const total = useMemo(() => items.reduce((sum, i) => sum + i.product.priceGBP, 0), [items])

  const suggestions = useMemo(() => {
    const result: BasketSuggestion[] = []
    const examItems = items.filter((i) => i.product.kind === 'exam')
    const hasSubscription = items.some((i) => i.product.kind === 'subscription')
    const hasBundle = items.some((i) => i.product.kind === 'bundle')

    if (hasSubscription || hasBundle) return result

    const examTotal = examItems.reduce((s, i) => s + i.product.priceGBP, 0)
    const pick2Price = 1700 // £17
    const pick3Price = 2500 // £25
    const monthlyPrice = 1000 // £10/mo
    const annualPrice = 9600  // £96/yr

    // 1 exam: tease the 2-for-£17 deal
    if (examItems.length === 1) {
      const saving = examItems[0].product.priceGBP * 2 - pick2Price
      result.push({
        message: `Add a 2nd exam and pay just £17 for both — that's £${(pick2Price / 100).toFixed(0)} instead of £${((examItems[0].product.priceGBP * 2) / 100).toFixed(0)}.`,
        suggestedProductId: 'bundle:pick-2',
        saving,
      })
    }

    // 2 exams: offer the pick-2 bundle (saves £1) and tease pick-3
    if (examItems.length === 2) {
      const saving2 = examTotal - pick2Price
      if (saving2 > 0) {
        result.push({
          message: `Switch to the 2-exam pack for £17 and save £${(saving2 / 100).toFixed(0)} vs buying individually.`,
          suggestedProductId: 'bundle:pick-2',
          saving: saving2,
        })
      }
      result.push({
        message: `Or go bigger — the 3-exam pack is just £25. Add one more exam and save even more.`,
        suggestedProductId: 'bundle:pick-3',
        saving: examItems[0].product.priceGBP * 3 - pick3Price,
      })
    }

    // 3 exams: offer the pick-3 bundle (saves £2)
    if (examItems.length === 3) {
      const saving3 = examTotal - pick3Price
      if (saving3 > 0) {
        result.push({
          message: `Switch to the 3-exam pack for £25 and save £${(saving3 / 100).toFixed(0)} vs buying individually.`,
          suggestedProductId: 'bundle:pick-3',
          saving: saving3,
        })
      }
    }

    // 4+ exams: suggest All-Access
    if (examItems.length >= 4) {
      result.push({
        message: `With ${examItems.length} exams (${formatPence(examTotal)}), the All-Access Monthly plan is better value — unlimited access to every exam and skill lab for just ${formatPence(monthlyPrice)}/mo.`,
        suggestedProductId: 'sub:all-access',
        saving: examTotal - monthlyPrice,
      })
      result.push({
        message: `Or save more with the All-Access Annual plan at ${formatPence(annualPrice)}/year (${formatPence(800)}/mo).`,
        suggestedProductId: 'sub:all-access-annual',
        saving: examTotal - annualPrice,
      })
      return result
    }

    // 2+ exams total exceeds monthly sub price: also offer All-Access
    if (examItems.length >= 2 && examTotal >= monthlyPrice) {
      result.push({
        message: `Or go unlimited — All-Access Monthly gives every exam and skill lab for just ${formatPence(monthlyPrice)}/mo.`,
        suggestedProductId: 'sub:all-access',
        saving: examTotal - monthlyPrice,
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

function formatPence(pence: number): string {
  const pounds = pence / 100
  return pounds % 1 === 0 ? `\u00a3${pounds}` : `\u00a3${pounds.toFixed(2)}`
}
