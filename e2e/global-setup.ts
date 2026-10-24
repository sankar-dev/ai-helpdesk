// Runs once after the web servers are listening (Playwright starts webServer before globalSetup).
// The API server doesn't touch the database until the first request, so it is safe to prepare
// the database here, then sign in as the seeded admin and save the session, so tests can skip
// the login page with test.use({ storageState: adminStorageState }).
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { request } from '@playwright/test'
import { prepareTestDatabase } from './scripts/prepare-db.ts'
import { adminStorageState, clientUrl, testAdmin } from './test-env.ts'

export default async function globalSetup() {
  await prepareTestDatabase()

  // Better Auth checks the Origin header on sign-in, as a browser would send it
  const context = await request.newContext({
    baseURL: clientUrl,
    extraHTTPHeaders: { Origin: clientUrl },
  })
  try {
    const response = await context.post('/api/auth/sign-in/email', {
      data: { email: testAdmin.email, password: testAdmin.password },
    })
    if (!response.ok()) {
      throw new Error(`Admin sign-in failed: ${response.status()} ${await response.text()}`)
    }
    await mkdir(dirname(adminStorageState), { recursive: true })
    await context.storageState({ path: adminStorageState })
  } finally {
    await context.dispose()
  }
}
