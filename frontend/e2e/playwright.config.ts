import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  // Parallel: backend is started below with RATE_LIMIT_DISABLED=true so the
  // shared-localhost-IP bucket no longer 429s. CI stays conservative at 2.
  workers: process.env.CI ? 2 : undefined,
  fullyParallel: true,
  retries: 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    // Capture screenshot on failure
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium',      use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],

  webServer: [
    {
      // Backend: dev auth + local data sources, no AWS calls
      command: 'RATE_LIMIT_DISABLED=true AUTH_MODE=dev EXAM_SOURCE=local SKILL_LAB_SOURCE=local pnpm dev',
      cwd: '../../backend',
      url: 'http://localhost:3000/health',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      // Frontend: dev auth mode so AuthContext uses /auth/config mock
      command: 'VITE_AUTH_MODE=dev pnpm dev',
      cwd: '..',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
})
