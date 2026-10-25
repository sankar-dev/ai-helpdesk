import { defineConfig, devices } from '@playwright/test'
import { clientPort, clientUrl, serverPort, serverTestEnv, serverUrl } from './test-env.ts'

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  // Tests share one database, so run them one at a time until they isolate their data
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: clientUrl,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Wait for the port, not /api/health: the test database is only created and migrated
      // in global-setup.ts, which Playwright runs after the web servers are up
      command: 'npx tsx src/index.ts',
      cwd: '../server',
      port: serverPort,
      env: serverTestEnv,
      // Cold starts on this machine can take about 3 minutes
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
    },
    {
      command: `npm run dev -- --port ${clientPort} --strictPort`,
      cwd: '../client',
      url: clientUrl,
      env: { API_PROXY_TARGET: serverUrl },
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
