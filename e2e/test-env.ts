// Shared settings for the end-to-end run: ports, the test database, and the seeded admin.
// The test server and client run on their own ports, so they can sit beside `npm run dev`.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

export const serverPort = 3001
export const clientPort = 5174
export const serverUrl = `http://localhost:${serverPort}`
export const clientUrl = `http://localhost:${clientPort}`

export const testAdmin = {
  email: 'admin@helpdesk.test',
  password: 'e2e-admin-password',
  name: 'E2E Admin',
}

// Signed-in sessions saved by global-setup.ts and deleted by global-teardown.ts
export const authDir = fileURLToPath(new URL('./playwright/.auth', import.meta.url))
export const adminStorageState = `${authDir}/admin.json`

function readServerEnv(): Record<string, string | undefined> {
  try {
    return parseEnv(readFileSync(new URL('../server/.env', import.meta.url), 'utf8'))
  } catch {
    return {}
  }
}

// TEST_DATABASE_URL wins; otherwise reuse the dev connection with the database renamed to helpdesk_test.
function resolveTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL
  }
  const devUrl = readServerEnv().DATABASE_URL
  if (!devUrl) {
    throw new Error('Set TEST_DATABASE_URL, or DATABASE_URL in server/.env')
  }
  const url = new URL(devUrl)
  url.pathname = '/helpdesk_test'
  return url.toString()
}

export const testDatabaseUrl = resolveTestDatabaseUrl()
export const testDatabaseName = new URL(testDatabaseUrl).pathname.slice(1)

// The prepare script wipes this database, so never let it point at a real one
if (!testDatabaseName.endsWith('_test')) {
  throw new Error(`Test database name must end with "_test" (got "${testDatabaseName}")`)
}

// Environment for the API server and its Prisma commands during the e2e run.
// These override server/.env, because the server's loadEnvFile() never replaces existing variables.
export const serverTestEnv = {
  NODE_ENV: 'test',
  PORT: String(serverPort),
  DATABASE_URL: testDatabaseUrl,
  BETTER_AUTH_URL: serverUrl,
  BETTER_AUTH_SECRET: 'e2e-only-secret-not-used-anywhere-else-0123456789',
  CLIENT_URL: clientUrl,
  SEED_ADMIN_EMAIL: testAdmin.email,
  SEED_ADMIN_PASSWORD: testAdmin.password,
  SEED_ADMIN_NAME: testAdmin.name,
}
