/**
 * Skill lab gating tests.
 *
 * Covers:
 *   - Visitor: labs page loads; cannot start a locked lab
 *   - Registered: locked lab shows upgrade prompt; free labs can be started
 *
 * SkillLabDetailPage fetches GET /skill-labs (the list) and finds by ID.
 * mockLabList() intercepts only the exact list path (not /skill-labs/:id).
 *
 * Isolation: /skill-labs/my-active-attempt is mocked to {} so the detail page
 * never shows "another lab in progress" from a concurrent parallel test.
 */

import { test, expect } from '../fixtures/base'

const LAB_ID = 'anthropic-fix-agent-definition-task-tool'

const LOCKED_LAB: Record<string, unknown> = {
  id: LAB_ID,
  title: 'Fix a Broken AgentDefinition',
  description: 'Test lab',
  type: 'policy-fix',
  difficulty: 'intermediate',
  platform: 'Anthropic',
  category: 'AI/ML',
  labCategory: 'Fix',
  technologies: ['Claude SDK'],
  scenario: 'Fix the broken policy.',
  brokenPolicy: '{}',
  correctPolicy: '{}',
  validations: [],
  explanation: 'Explanation here.',
  locked: true,
  showcase: true,
}

const UNLOCKED_LAB = { ...LOCKED_LAB, locked: false }

// Intercept GET /skill-labs (list) only — not /skill-labs/:id or other sub-paths.
async function mockLabList(page: import('@playwright/test').Page, lab: Record<string, unknown>) {
  await page.route('**/skill-labs**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/skill-labs' && route.request().method() === 'GET') {
      await route.fulfill({ json: [lab] })
    } else {
      await route.continue()
    }
  })
}

test.beforeEach(async ({ page }) => {
  // Prevent "another lab in progress" from a concurrent parallel test
  await page.route('**/skill-labs/my-active-attempt**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: {} })
    } else {
      await route.continue()
    }
  })
})

test.describe('Lab gating — visitor', () => {
  test('/skill-labs page loads for a visitor', async ({ page, asVisitor }) => {
    await page.goto('/skill-labs')
    await expect(
      page.locator('[data-testid="lab-card"]').first()
    ).toBeVisible({ timeout: 15_000 })
  })

  test('visitor cannot start a locked lab — sees upgrade prompt', async ({ page, asVisitor }) => {
    await mockLabList(page, LOCKED_LAB)
    await page.goto(`/skill-labs/${LAB_ID}`)

    await expect(
      page.getByText(/upgrade your plan/i)
    ).toBeVisible({ timeout: 10_000 })

    await expect(page.getByRole('button', { name: /start lab/i })).not.toBeVisible()
  })
})

test.describe('Lab gating — registered', () => {
  test('locked lab shows upgrade prompt for registered user', async ({ page, asRegistered }) => {
    await mockLabList(page, LOCKED_LAB)
    await page.goto(`/skill-labs/${LAB_ID}`)

    await expect(
      page.getByText(/upgrade your plan/i)
    ).toBeVisible({ timeout: 10_000 })
  })

  test('unlocked lab shows Start Lab for registered user', async ({ page, asRegistered }) => {
    await mockLabList(page, UNLOCKED_LAB)
    await page.goto(`/skill-labs/${LAB_ID}`)

    await expect(
      page.getByRole('button', { name: /start lab/i })
    ).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Lab gating — paying', () => {
  test('paying user sees Start Lab on a locked lab (pays → unlocks)', async ({ page, asPaying }) => {
    await mockLabList(page, UNLOCKED_LAB)
    await page.goto(`/skill-labs/${LAB_ID}`)

    await expect(
      page.getByRole('button', { name: /start lab/i })
    ).toBeVisible({ timeout: 10_000 })
  })
})
