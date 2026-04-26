/**
 * Exam gating tests.
 *
 * Note on AUTH_MODE=dev: the backend always injects dev-user-001 for all
 * requests (registered-free tier). The visitor tier is simulated at the
 * *frontend* level only (no auth token → AuthContext stays null).
 *
 * For reliable gating assertions we mock /exams/:code/questions to return
 * the limited:true response the backend would give to those tiers.
 */

import { test, expect } from '../fixtures/base'

const EXAM_CODE = 'AIF-C01'

// Minimal questions payload that simulates a limited response
const LIMITED_VISITOR_RESPONSE = {
  tier: 'visitor',
  limited: true,
  questions: [],
  totalAvailable: 65,
}

const LIMITED_REGISTERED_RESPONSE = {
  tier: 'registered',
  limited: true,
  questions: [{ id: 'q1', type: 'single-choice', question: 'Test?', choices: [], domain: 'ML', difficulty: 1, explanation: '' }],
  totalAvailable: 65,
}

test.describe('Exam gating — visitor', () => {
  test('visitor sees sign-up CTA on a limited exam', async ({ page, asVisitor }) => {
    // Simulate backend returning limited:true for a visitor
    await page.route(`**/exams/${EXAM_CODE}/questions**`, (route) =>
      route.fulfill({ json: LIMITED_VISITOR_RESPONSE })
    )

    await page.goto(`/exams/${EXAM_CODE}`)

    // The limited banner renders a "Sign up free" button for visitors.
    // Target the button directly (not .or() — the span also contains "free account" text).
    await expect(
      page.getByRole('button', { name: 'Sign up free' })
    ).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Exam gating — registered', () => {
  test('registered user sees upgrade CTA (not full question bank)', async ({ page, asRegistered }) => {
    await page.route(`**/exams/${EXAM_CODE}/questions**`, (route) =>
      route.fulfill({ json: LIMITED_REGISTERED_RESPONSE })
    )

    await page.goto(`/exams/${EXAM_CODE}`)

    // Registered limited banner shows "View plans" button.
    await expect(
      page.getByRole('button', { name: 'View plans' })
    ).toBeVisible({ timeout: 10_000 })
  })

  test('registered user can still start exam with limited questions', async ({ page, asRegistered }) => {
    await page.goto(`/exams/${EXAM_CODE}`)

    // Start exam regardless of limited banner
    const startBtn = page.getByRole('button', { name: /start exam|start new/i })
    await expect(startBtn).toBeVisible({ timeout: 10_000 })
    await startBtn.click()

    await expect(page).toHaveURL(`/exams/${EXAM_CODE}/attempt`)
  })
})
