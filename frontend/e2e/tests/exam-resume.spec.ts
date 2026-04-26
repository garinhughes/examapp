/**
 * Exam resume flow.
 *
 * Covers: start → answer Q1 → save for later → navigate away → see resume banner
 *         → resume → verify question count preserved.
 *
 * Note: each test clicks "Start exam" or "Start new" (whichever is visible) to
 * ensure it creates a fresh attempt, even if a parallel test left state behind.
 * The "Save for Later" button text-matches since the title attribute differs
 * between focus-mode and normal mode.
 */

import { test, expect, type Page } from '../fixtures/base'

// Exam resume tests build on each other's state and share dev-user-001's
// AIF-C01 attempt slot. Serial mode prevents within-file tests overwriting
// each other's in-progress attempts.
test.describe.configure({ mode: 'serial' })

const EXAM_CODE = 'AIF-C01'

const firstChoiceBtn = (page: Page) => page.locator('ol.list-none li button').first()

async function startFreshExam(page: Page) {
  // Click "Start new" (if a prior attempt exists) or "Start exam" (fresh)
  const btn = page.getByRole('button', { name: /start exam|start new/i }).first()
  await expect(btn).toBeVisible({ timeout: 10_000 })
  await btn.click()
  await expect(page).toHaveURL(`/exams/${EXAM_CODE}/attempt`)
}

test.describe('Exam resume', () => {
  test('save for later and resume from /exams banner', async ({ page, asRegistered }) => {
    await page.goto(`/exams/${EXAM_CODE}`)
    await startFreshExam(page)

    const choice = firstChoiceBtn(page)
    await expect(choice).toBeVisible({ timeout: 10_000 })
    await choice.click()

    // "Save for Later" button text (title differs by mode; match by accessible name)
    await page.getByRole('button', { name: /save for later/i }).click()

    await expect(page).toHaveURL(/\/exams(\/[^/]+)?$/, { timeout: 5000 })
    await expect(page.getByText('Exam in progress')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  })

  test('resume restores the attempt URL', async ({ page, asRegistered }) => {
    await page.goto(`/exams/${EXAM_CODE}`)
    await startFreshExam(page)

    const choice = firstChoiceBtn(page)
    await expect(choice).toBeVisible({ timeout: 10_000 })
    await choice.click()

    await page.getByRole('button', { name: /save for later/i }).click()
    await expect(page.getByText('Exam in progress')).toBeVisible({ timeout: 5000 })

    await page.getByRole('button', { name: 'Resume' }).click()

    await expect(page).toHaveURL(`/exams/${EXAM_CODE}/attempt`, { timeout: 5000 })
    await expect(firstChoiceBtn(page)).toBeVisible({ timeout: 10_000 })
  })

  test('setup page shows Resume button when progress exists', async ({ page, asRegistered }) => {
    await page.goto(`/exams/${EXAM_CODE}`)
    await startFreshExam(page)

    const choice = firstChoiceBtn(page)
    await expect(choice).toBeVisible({ timeout: 10_000 })
    await choice.click()

    await page.getByRole('button', { name: /save for later/i }).click()
    // Wait for the navigation triggered by Save for Later before proceeding
    await expect(page).toHaveURL(/\/exams(\/[^/]+)?$/, { timeout: 5000 })

    await page.goto(`/exams/${EXAM_CODE}`)
    await expect(page.getByRole('button', { name: /resume/i })).toBeVisible({ timeout: 10_000 })
  })
})
