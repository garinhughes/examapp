/**
 * useEntitlements - hook to fetch the user's tier + entitlements from the backend.
 *
 * Returns:
 *   tier          - 'visitor' | 'registered' | 'pro' | 'pro_plus'
 *   tierConfig    - full tier feature flags
 *   entitlements  - list of active product IDs
 *   products      - full catalog with `owned` and optional `discountedPriceGBP` per product
 *   discountActive - true when a discount is currently active
 *   loading       - true while fetching
 *   refresh()     - re-fetch entitlements
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useAuthFetch } from '../auth/useAuthFetch'

export type Tier = 'visitor' | 'registered' | 'pro' | 'pro_plus'

export interface TierConfig {
  tier: Tier
  label: string
  questionLimit: number | null
  attemptLimit: number | null
  reviewEnabled: boolean
  exportEnabled: boolean
  leaderboardEnabled: boolean
  domainMasteryEnabled: boolean
  trialDays: number | null
  labShowcaseCount: number | null
}

export interface CatalogProduct {
  productId: string
  kind: 'subscription' | 'one-off' | 'extra'
  label: string
  description: string
  priceGBP: number
  /** Set when a discount is active — the effective price to charge. */
  discountedPriceGBP?: number
  billingPeriod?: 'monthly'
  owned: boolean
}

interface EntitlementState {
  tier: Tier
  tierConfig: TierConfig
  entitlements: string[]
  products: CatalogProduct[]
  tiers: TierConfig[]
  discountActive: boolean
  loading: boolean
  refresh: () => void
}

/** Returns true if the user is on a paid plan (Pro or Pro Plus). */
export function isPaidTier(tier: Tier | null | undefined): boolean {
  return tier === 'pro' || tier === 'pro_plus'
}

const DEFAULT_TIER_CONFIG: TierConfig = {
  tier: 'visitor',
  label: 'Free / Visitor',
  questionLimit: 20,
  attemptLimit: 0,
  reviewEnabled: false,
  exportEnabled: false,
  leaderboardEnabled: false,
  domainMasteryEnabled: false,
  trialDays: null,
  labShowcaseCount: 6,
}

export function useEntitlements(): EntitlementState {
  const { user } = useAuth()
  const authFetch = useAuthFetch()
  const [data, setData] = useState<{
    tier: Tier
    tierConfig: TierConfig
    entitlements: string[]
    products: CatalogProduct[]
    tiers: TierConfig[]
    discountActive: boolean
  }>({
    tier: user ? 'registered' : 'visitor',
    tierConfig: DEFAULT_TIER_CONFIG,
    entitlements: [],
    products: [],
    tiers: [],
    discountActive: false,
  })
  const [loading, setLoading] = useState(true)

  const fetchPricing = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/pricing')
      if (res.ok) {
        const json = await res.json()
        setData({
          tier: json.tier ?? (user ? 'registered' : 'visitor'),
          tierConfig: json.tierConfig ?? DEFAULT_TIER_CONFIG,
          entitlements: json.entitlements ?? [],
          products: json.products ?? [],
          tiers: json.tiers ?? [],
          discountActive: json.discountActive ?? false,
        })
      }
    } catch {
      // fallback - use defaults
    } finally {
      setLoading(false)
    }
  }, [authFetch, user])

  useEffect(() => {
    fetchPricing()
  }, [fetchPricing])

  // Re-fetch when the tab regains focus, so expiring entitlements (e.g. lab access)
  // are reflected in the UI without requiring a full page reload.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') fetchPricing()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [fetchPricing])

  return {
    ...data,
    loading,
    refresh: fetchPricing,
  }
}
