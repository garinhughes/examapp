/**
 * Playwright tier fixtures for examapp.
 *
 * Three tiers are simulated via page.route() before page.goto(), relying on
 * AUTH_MODE=dev on the backend (no Cognito) and VITE_AUTH_MODE=dev on the
 * frontend (AuthContext calls /auth/config to hydrate the user).
 *
 * asVisitor    — /auth/config returns no devUser → frontend stays unauthenticated
 * asRegistered — /auth/config returns devUser; /auth/me returns tier:registered
 * asPaying     — /auth/config returns devUser; /auth/me + /pricing return pro tier
 */

import { test as base, expect, type Page } from '@playwright/test'

export type { Page }
export { expect }

// Intercept /auth/config so the frontend gets no devUser → visitor state
async function mockVisitor(page: Page) {
  await page.route('**/auth/config', (route) =>
    route.fulfill({ json: { authMode: 'dev' } })
  )
}

// Intercept /auth/me to return a specific tier; /pricing for paying tier
async function mockTier(page: Page, tier: 'registered' | 'pro') {
  const mePayload =
    tier === 'pro'
      ? { tier: 'pro', sub: 'test-paying-001', email: 'pro@test.local', name: 'Pro User' }
      : { tier: 'registered', sub: 'test-reg-001', email: 'reg@test.local', name: 'Reg User' }

  await page.route('**/auth/me', (route) => route.fulfill({ json: mePayload }))

  if (tier === 'pro') {
    await page.route('**/pricing', (route) =>
      route.fulfill({
        json: {
          tier: 'pro',
          entitlements: ['sub:all-access'],
          products: [],
          tiers: [],
          discountActive: false,
        },
      })
    )
  }
}

// Fixtures exposed to every test file
export const test = base.extend<{
  asVisitor: void
  asRegistered: void
  asPaying: void
}>({
  asVisitor: [
    async ({ page }, use) => {
      await mockVisitor(page)
      await use()
    },
    { auto: false },
  ],
  asRegistered: [
    async ({ page }, use) => {
      await mockTier(page, 'registered')
      await use()
    },
    { auto: false },
  ],
  asPaying: [
    async ({ page }, use) => {
      await mockTier(page, 'pro')
      await use()
    },
    { auto: false },
  ],
})
