/**
 * Timed exam flow.
 *
 * Covers: select timed mode → verify timer → pause → submit.
 *
 * Timer renders as a <div class="...whitespace-nowrap"> sibling to the Pause
 * button — it is NOT a <span> and is hidden on mobile (hidden sm:flex container).
 * After pausing the text gains " (paused)" — regex uses substring match.
 *
 * Isolation: /attempts/in-progress is mocked to [] so the setup page always
 * shows "Start exam".
 */

import { test, expect, type Page } from '../fixtures/base'

const EXAM_CODE = 'AIF-C01'

// Matches MM:SS anywhere in the text (handles " (paused)" suffix too)
const TIMER_RE = /\d{2}:\d{2}/

const firstChoiceBtn = (page: Page) => page.locator('ol.list-none li button').first()

// Timer div: sibling of the pause/resume button, has class "whitespace-nowrap"
const timerEl = (page: Page) =>
  page.locator('[class*="whitespace-nowrap"]').filter({ hasText: TIMER_RE }).first()

test.beforeEach(async ({ page }) => {
  await page.route('**/attempts/in-progress**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { attempts: [] } })
    } else {
      await route.continue()
    }
  })
})

test.describe('Timed exam flow', () => {
  test('timed mode shows a running timer', async ({ page, asRegistered }, testInfo) => {
    // Timer container is hidden sm:flex — not visible below 640px viewport
    test.skip((page.viewportSize()?.width ?? 1280) < 640, 'Timer hidden on mobile viewports')
    await page.goto(`/exams/${EXAM_CODE}`)

    await page.getByRole('button', { name: /timed exam/i }).click()
    await page.getByRole('button', { name: /start exam/i }).click()
    await expect(page).toHaveURL(`/exams/${EXAM_CODE}/attempt`)

    await expect(timerEl(page)).toBeVisible({ timeout: 10_000 })
    const t1 = await timerEl(page).textContent()
    expect(t1).toMatch(TIMER_RE)
  })

  test('pause button stops the timer', async ({ page, asRegistered }) => {
    test.skip((page.viewportSize()?.width ?? 1280) < 640, 'Timer hidden on mobile viewports')
    await page.goto(`/exams/${EXAM_CODE}`)
    await page.getByRole('button', { name: /timed exam/i }).click()
    await page.getByRole('button', { name: /start exam/i }).click()
    await expect(page).toHaveURL(`/exams/${EXAM_CODE}/attempt`)

    await expect(timerEl(page)).toBeVisible({ timeout: 10_000 })

    const pauseBtn = page.getByTitle('Pause timer')
    await expect(pauseBtn).toBeVisible()
    await pauseBtn.click()

    await page.getByTitle('Resume timer').waitFor({ timeout: 3000 })
    const frozen = await timerEl(page).textContent()

    await page.waitForTimeout(2000)
    const stillFrozen = await timerEl(page).textContent()
    expect(frozen).toBe(stillFrozen)
  })

  test('submit timed exam produces a score', async ({ page, asRegistered }) => {
    await page.goto(`/exams/${EXAM_CODE}`)
    await page.getByRole('button', { name: /timed exam/i }).click()
    await page.getByRole('button', { name: /start exam/i }).click()
    await expect(page).toHaveURL(`/exams/${EXAM_CODE}/attempt`)

    const choice = firstChoiceBtn(page)
    await expect(choice).toBeVisible({ timeout: 10_000 })
    await choice.click()

    const submitBtn = page.getByRole('button', { name: /submit.*exam/i })
    if (await submitBtn.isVisible()) {
      await submitBtn.click()
      const confirmBtn = page.getByRole('button', { name: /submit/i }).last()
      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmBtn.click()
      }
    }

    await expect(
      page.getByText(/\d+%|passed|failed|score|correct/i).first()
    ).toBeVisible({ timeout: 15_000 })
  })
})
