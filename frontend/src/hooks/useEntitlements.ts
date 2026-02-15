/**
 * useEntitlements — hook to fetch the user's tier + entitlements from the backend.
 *
 * Returns:
 *   tier       — 'visitor' | 'registered' | 'paying'
 *   tierConfig — full tier feature flags
 *   entitlements — list of active product IDs
 *   products   — full catalog with `owned` flag per product
 *   loading    — true while fetching
 *   refresh()  — re-fetch entitlements
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useAuthFetch } from '../auth/useAuthFetch'

export type Tier = 'visitor' | 'registered' | 'paying'

export interface TierConfig {
  tier: Tier
  label: string
  questionLimit: number | null
  attemptLimit: number | null
  reviewEnabled: boolean
  exportEnabled: boolean
  leaderboardEnabled: boolean
  domainMasteryEnabled: boolean
}

export interface CatalogProduct {
  productId: string
  kind: 'exam' | 'bundle' | 'subscription' | 'extra'
  label: string
  description: string
  priceGBP: number
  billingPeriod?: 'monthly' | 'annual'
  examCodes?: string[]
  owned: boolean
}

interface EntitlementState {
  tier: Tier
  tierConfig: TierConfig
  entitlements: string[]
  products: CatalogProduct[]
  tiers: TierConfig[]
  loading: boolean
  refresh: () => void
}

const DEFAULT_TIER_CONFIG: TierConfig = {
  tier: 'visitor',
  label: 'Free / Visitor',
  questionLimit: 10,
  attemptLimit: 0,
  reviewEnabled: false,
  exportEnabled: false,
  leaderboardEnabled: false,
  domainMasteryEnabled: false,
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
  }>({
    tier: user ? 'registered' : 'visitor',
    tierConfig: DEFAULT_TIER_CONFIG,
    entitlements: [],
    products: [],
    tiers: [],
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
        })
      }
    } catch {
      // fallback — use defaults
    } finally {
      setLoading(false)
    }
  }, [authFetch, user])

  useEffect(() => {
    fetchPricing()
  }, [fetchPricing])

  return {
    ...data,
    loading,
    refresh: fetchPricing,
  }
}
