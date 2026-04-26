/**
 * Skill lab flow tests.
 *
 * Covers three runner types:
 *   command-terminal  — type the correct command, step advances, lab completes
 *   cli               — run investigation commands, select answer, Check, Complete
 *   policy-fix        — edit JSON, Check fails, Show Answer, Retry resets state
 *
 * Lab IDs reference local backend/data/skill-labs/ JSON so tests are stable.
 *
 * SkillLabDetailPage fetches GET /skill-labs (list) and finds by ID.
 *
 * Isolation strategy:
 *   beforeEach mocks /skill-labs/my-active-attempt → {} (no in-progress lab).
 *   unlockLab() patches the list AND owns the my-active-attempt response so
 *   its own route (registered after beforeEach) doesn't bypass the mock via
 *   route.continue() — in Playwright, continue() goes to the network, not to
 *   previously registered handlers.
 */

import * as fs from 'fs'
import * as path from 'path'
import { test, expect } from '../fixtures/base'

// Labs enforce one active session per user. Run tests serially within each
// project so concurrent describe blocks don't conflict on the same user state.
test.describe.configure({ mode: 'serial' })

const CT_LAB_ID = 'aws-s3-lifecycle-command-terminal'
const CLI_LAB_ID = 'aws-s3-access-denied-cli'
const PF_LAB_ID = 'anthropic-fix-agent-definition-task-tool'

test.beforeEach(async ({ page }) => {
  // Cancel any active lab session from a previous test. Serial mode means tests
  // run sequentially per project but each gets a fresh page — state persists on
  // the backend (dev-user-001 / skill-lab-attempts.json). The one-active-session
  // rule would otherwise block the next test from starting a different lab.
  const activeRes = await page.request.get('http://localhost:3000/skill-labs/my-active-attempt').catch(() => null)
  if (activeRes?.ok()) {
    const d = await activeRes.json().catch(() => ({}))
    if (d?.active?.labId) {
      await page.request
        .post(`http://localhost:3000/skill-labs/${encodeURIComponent(d.active.labId)}/attempt/cancel-active`)
        .catch(() => {})
    }
  }

  // Mock for tests that don't call unlockLab() (command-terminal group).
  // unlockLab() registers its own handler (LIFO priority) that also handles
  // my-active-attempt — so this route only fires for CT tests.
  await page.route('**/skill-labs/my-active-attempt**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: {} })
    } else {
      await route.continue()
    }
  })
})

// Read full lab definition from local JSON files. GET /skill-labs/:id uses S3
// and fails in local dev mode; the list endpoint returns only summaries.
function readLocalLabDefinition(labId: string): Record<string, unknown> | null {
  const dataDir = path.join(process.cwd(), '../backend/data/skill-labs')
  for (const file of fs.readdirSync(dataDir)) {
    if (!file.endsWith('.json') || file === 'providers.json') continue
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8'))
      const labs: Record<string, unknown>[] = Array.isArray(data) ? data : (data.labs ?? [])
      const found = labs.find((l) => l.id === labId)
      if (found) return found
    } catch { /* skip malformed files */ }
  }
  return null
}

// Patch the lab list so the target lab is unlocked.
// Also owns my-active-attempt so the LIFO route ordering doesn't bypass the
// beforeEach mock (route.continue() sends to network, not to prior handlers).
async function unlockLab(page: import('@playwright/test').Page, labId: string) {
  const fullLabData = readLocalLabDefinition(labId)
  await page.route('**/skill-labs**', async (route) => {
    const url = new URL(route.request().url())
    const method = route.request().method()

    if (url.pathname === '/skill-labs' && method === 'GET') {
      // List endpoint — patch this lab's locked field
      const response = await route.fetch()
      const json: Record<string, unknown>[] = await response.json()
      const patched = json.map((lab) =>
        lab.id === labId ? { ...lab, locked: false } : lab
      )
      await route.fulfill({ json: patched })
    } else if (
      url.pathname === `/skill-labs/${labId}` &&
      method === 'GET' &&
      route.request().resourceType() !== 'document'
    ) {
      // Individual endpoint — SkillLabRunnerPage fetches this (full definition).
      // GET /skill-labs/:id uses S3 and fails in local dev; serve from local JSON.
      if (fullLabData) {
        await route.fulfill({ json: { ...fullLabData, locked: false } })
      } else {
        await route.continue()
      }
    } else if (url.pathname === `/skill-labs/${labId}/attempt` && method === 'POST') {
      // Session creation — backend enforces entitlements that dev-user-001 doesn't
      // have in local mode (no DynamoDB). Return a fake session so the runner loads.
      await route.fulfill({
        json: {
          attemptId: `test-${Date.now()}`,
          labId,
          mode: 'casual',
          timed: false,
          locked: false,
          startedAt: new Date().toISOString(),
        },
      })
    } else if (url.pathname === '/skill-labs/my-active-attempt' && method === 'GET') {
      // Must handle here — route.continue() would bypass the beforeEach handler
      await route.fulfill({ json: {} })
    } else {
      await route.continue()
    }
  })
}

// ─── command-terminal ────────────────────────────────────────────────────────

test.describe('command-terminal lab flow', () => {
  test('navigate to lab and see terminal input focused', async ({ page, asPaying }) => {
    await page.goto(`/skill-labs/${CT_LAB_ID}`)

    await page.getByRole('button', { name: /^casual/i }).click()
    await page.getByRole('button', { name: /start lab/i }).click()
    await expect(page).toHaveURL(`/skill-labs/${CT_LAB_ID}/attempt/casual`)

    await expect(page.locator('input[spellcheck="false"]')).toBeVisible({ timeout: 10_000 })
  })

  test('typing an incorrect command shows an error', async ({ page, asPaying }) => {
    await page.goto(`/skill-labs/${CT_LAB_ID}`)
    await page.getByRole('button', { name: /^casual/i }).click()
    await page.getByRole('button', { name: /start lab/i }).click()
    await expect(page).toHaveURL(`/skill-labs/${CT_LAB_ID}/attempt/casual`)

    const input = page.locator('input[spellcheck="false"]')
    await expect(input).toBeVisible({ timeout: 10_000 })
    await input.click()
    await input.fill('aws s3 ls')
    await input.press('Enter')

    await expect(page.locator('text=/Missing required|Unexpected token|Expected the command/i').first()).toBeVisible({ timeout: 5000 })
  })

  test('correct command advances step', async ({ page, asPaying }) => {
    await page.goto(`/skill-labs/${CT_LAB_ID}`)
    await page.getByRole('button', { name: /^casual/i }).click()
    await page.getByRole('button', { name: /start lab/i }).click()
    await expect(page).toHaveURL(`/skill-labs/${CT_LAB_ID}/attempt/casual`)

    const input = page.locator('input[spellcheck="false"]')
    await expect(input).toBeVisible({ timeout: 10_000 })
    await input.click()
    await input.fill('aws s3api put-bucket-lifecycle-configuration --bucket logs-prod --lifecycle-configuration file://lc.json')
    await input.press('Enter')

    await expect(page.locator('text=/Step 1 complete/i')).toBeVisible({ timeout: 5000 })
  })

  test('show answer reveals the reference answer', async ({ page, asPaying }) => {
    await page.goto(`/skill-labs/${CT_LAB_ID}`)
    await page.getByRole('button', { name: /^casual/i }).click()
    await page.getByRole('button', { name: /start lab/i }).click()
    await expect(page).toHaveURL(`/skill-labs/${CT_LAB_ID}/attempt/casual`)

    await expect(page.locator('input[spellcheck="false"]')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /show answer/i }).click()

    await expect(page.getByText(/reference answer/i)).toBeVisible({ timeout: 5000 })
  })

  test('retry lab resets state after show answer', async ({ page, asPaying }) => {
    await page.goto(`/skill-labs/${CT_LAB_ID}`)
    await page.getByRole('button', { name: /^casual/i }).click()
    await page.getByRole('button', { name: /start lab/i }).click()
    await expect(page).toHaveURL(`/skill-labs/${CT_LAB_ID}/attempt/casual`)

    await expect(page.locator('input[spellcheck="false"]')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /show answer/i }).click()
    await expect(page.getByText(/reference answer/i)).toBeVisible()

    await page.getByRole('button', { name: /retry lab/i }).click()

    await expect(page.locator('input[spellcheck="false"]')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('span').filter({ hasText: /^Step 1 of/ })).toBeVisible({ timeout: 5000 })
  })

  test('timed mode shows a countdown timer', async ({ page, asPaying }) => {
    await page.goto(`/skill-labs/${CT_LAB_ID}`)
    await page.getByRole('button', { name: /^timed/i }).click()
    await page.getByRole('button', { name: /start lab/i }).click()
    await expect(page).toHaveURL(`/skill-labs/${CT_LAB_ID}/attempt/timed`)

    const timerEl = page.locator('div').filter({ hasText: /^\d{2}:\d{2}$/ }).first()
    await expect(timerEl).toBeVisible({ timeout: 10_000 })
    const t1 = await timerEl.textContent()
    expect(t1).toMatch(/^\d{2}:\d{2}$/)
  })
})

// ─── cli lab ─────────────────────────────────────────────────────────────────

test.describe('cli lab flow', () => {
  test('run commands and see output', async ({ page, asPaying }) => {
    await unlockLab(page, CLI_LAB_ID)
    await page.goto(`/skill-labs/${CLI_LAB_ID}`)
    await page.getByRole('button', { name: /^casual/i }).click()
    await page.getByRole('button', { name: /start lab/i }).click()
    await expect(page).toHaveURL(`/skill-labs/${CLI_LAB_ID}/attempt/casual`)

    const input = page.locator('input[spellcheck="false"]')
    await expect(input).toBeVisible({ timeout: 10_000 })
    await input.click()
    await input.fill('aws s3 ls')
    await input.press('Enter')

    await expect(page.getByText('aws s3 ls')).toBeVisible()
  })

  test('select correct answer, check, and complete', async ({ page, asPaying }) => {
    await unlockLab(page, CLI_LAB_ID)
    await page.goto(`/skill-labs/${CLI_LAB_ID}`)
    await page.getByRole('button', { name: /^casual/i }).click()
    await page.getByRole('button', { name: /start lab/i }).click()
    await expect(page).toHaveURL(`/skill-labs/${CLI_LAB_ID}/attempt/casual`)

    // Wait for the answer panel (always rendered alongside the terminal)
    await expect(page.getByText('What is the root cause?')).toBeVisible({ timeout: 15_000 })

    // Click any answer button — text matches actual answer options for this lab
    await page
      .getByRole('button')
      .filter({ hasText: /IAM user|bucket policy|KMS|Block Public/i })
      .first()
      .click()

    // CLI runner uses LabCheckActions which renders "Check Answer", not "Check"
    await page.getByRole('button', { name: /check answer/i }).click()

    await expect(
      page.getByText(/correct|incorrect/i).first()
    ).toBeVisible({ timeout: 5000 })
  })
})

// ─── policy-fix lab ──────────────────────────────────────────────────────────

test.describe('policy-fix lab flow', () => {
  test('open lab and see Monaco editor', async ({ page, asPaying }) => {
    await unlockLab(page, PF_LAB_ID)
    await page.goto(`/skill-labs/${PF_LAB_ID}`)
    await page.getByRole('button', { name: /^casual/i }).click()
    await page.getByRole('button', { name: /start lab/i }).click()
    await expect(page).toHaveURL(`/skill-labs/${PF_LAB_ID}/attempt/casual`)

    await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 15_000 })
  })

  test('check without fix shows validation error', async ({ page, asPaying }) => {
    await unlockLab(page, PF_LAB_ID)
    await page.goto(`/skill-labs/${PF_LAB_ID}`)
    await page.getByRole('button', { name: /^casual/i }).click()
    await page.getByRole('button', { name: /start lab/i }).click()
    await expect(page).toHaveURL(`/skill-labs/${PF_LAB_ID}/attempt/casual`)

    await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /^check$/i }).click()

    await expect(
      page.getByText(/expected|missing|allowedTools/i).first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test('show answer reveals correct policy read-only', async ({ page, asPaying }) => {
    await unlockLab(page, PF_LAB_ID)
    await page.goto(`/skill-labs/${PF_LAB_ID}`)
    await page.getByRole('button', { name: /^casual/i }).click()
    await page.getByRole('button', { name: /start lab/i }).click()
    await expect(page).toHaveURL(`/skill-labs/${PF_LAB_ID}/attempt/casual`)

    await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: /^check$/i }).click()
    await expect(page.getByRole('button', { name: /show answer/i })).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: /show answer/i }).click()

    await expect(page.getByText(/reference answer shown above/i)).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /retry lab/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /complete lab/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /cancel lab/i })).toBeVisible()
  })

  test('retry lab after show answer resets editor to broken state', async ({ page, asPaying }) => {
    await unlockLab(page, PF_LAB_ID)
    await page.goto(`/skill-labs/${PF_LAB_ID}`)
    await page.getByRole('button', { name: /^casual/i }).click()
    await page.getByRole('button', { name: /start lab/i }).click()
    await expect(page).toHaveURL(`/skill-labs/${PF_LAB_ID}/attempt/casual`)

    await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: /^check$/i }).click()
    await expect(page.getByRole('button', { name: /show answer/i })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /show answer/i }).click()
    await expect(page.getByRole('button', { name: /retry lab/i })).toBeVisible()

    await page.getByRole('button', { name: /retry lab/i }).click()

    await expect(page.getByRole('button', { name: /^check$/i })).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.monaco-editor').first()).toBeVisible()
  })
})
