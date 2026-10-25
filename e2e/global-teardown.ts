// Runs once after all tests, before Playwright stops the web servers.
// Deletes the saved sessions, which hold live session tokens. Test data is left in the
// database on purpose so a failed run can be inspected; scripts/prepare-db.ts resets it next run.
import { rm } from 'node:fs/promises'
import { authDir } from './test-env.ts'

export default async function globalTeardown() {
  await rm(authDir, { recursive: true, force: true })
}
