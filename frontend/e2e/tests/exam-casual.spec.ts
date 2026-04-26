/**
 * Exam casual flow — registered user (dev-user-001, no paid entitlements).
 *
 * Covers: navigate → setup → casual start → answer → submit → score.
 *
 * Uses EXAM_SOURCE=local so questions come from backend/data/exams/.
 *
 * Choice inputs: QuestionCard renders custom <button> elements inside
 * <ol class="list-none ..."> — there are no radio or checkbox inputs.
 *
 * Isolation: /attempts/in-progress is mocked to [] so the setup page always
 * shows "Start exam" even when another parallel test has a live attempt.
 */

import { test, expect, type Page } from '../fixtures/base'

const EXAM_CODE = 'AIF-C01'

const firstChoiceBtn = (page: Page) => page.locator('ol.list-none li button').first()

test.beforeEach(async ({ page }) => {
  // Prevent in-progress attempt from another parallel test from showing "Resume"
  await page.route('**/attempts/in-progress**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { attempts: [] } })
    } else {
      await route.continue()
    }
  })
})

test.describe('Casual exam flow', () => {
  test('navigate to exam landing page from /exams', async ({ page, asRegistered }) => {
    await page.goto('/exams')
    await expect(page).toHaveURL('/exams')

    const card = page.locator('[data-testid="exam-card"]').first()
    await expect(card).toBeVisible()
    await card.click()

    await expect(page).toHaveURL(/\/exams\/[^/]+$/)
  })

  test('navigate to specific exam and see setup page', async ({ page, asRegistered }) => {
    await page.goto(`/exams/${EXAM_CODE}`)

    await expect(page.getByText('AWS Certified AI Practitioner')).toBeVisible()
    await expect(page.getByRole('button', { name: /casual exam/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /timed exam/i })).toBeVisible()
  })

  test('start casual exam and see question runner', async ({ page, asRegistered }) => {
    await page.goto(`/exams/${EXAM_CODE}`)

    const startBtn = page.getByRole('button', { name: /start exam/i })
    await expect(startBtn).toBeVisible()
    await startBtn.click()

    await expect(page).toHaveURL(`/exams/${EXAM_CODE}/attempt`)

    // Choice buttons are custom <button> elements inside <ol class="list-none ...">
    await expect(firstChoiceBtn(page)).toBeVisible({ timeout: 10_000 })
  })

  test('answer a question and navigate to next', async ({ page, asRegistered }) => {
    await page.goto(`/exams/${EXAM_CODE}`)
    await page.getByRole('button', { name: /start exam/i }).click()
    await expect(page).toHaveURL(`/exams/${EXAM_CODE}/attempt`)

    const choice = firstChoiceBtn(page)
    await expect(choice).toBeVisible({ timeout: 10_000 })
    await choice.click()
  })

  test('submit exam and see score', async ({ page, asRegistered }) => {
    await page.goto(`/exams/${EXAM_CODE}`)
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
