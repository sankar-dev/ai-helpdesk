// Creates users directly in helpdesk_test, the way server/src/scripts/seed.ts does through
// Better Auth's internal adapter (public sign-up is disabled and there are no user-management
// routes yet). Passwords are hashed in Better Auth's own scrypt format
// (@better-auth/utils/password), so the real sign-in endpoint accepts them.
import { randomBytes, randomUUID, scrypt } from 'node:crypto'
import { expect, type APIRequestContext } from '@playwright/test'
import pg from 'pg'
import { clientUrl, testDatabaseUrl } from '../test-env.ts'

export type Role = 'admin' | 'agent'

export type TestUser = {
  id: string
  email: string
  password: string
  name: string
  role: Role
}

const scryptParams = { N: 16384, r: 16, p: 1, dkLen: 64 }

function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      scryptParams.dkLen,
      {
        N: scryptParams.N,
        r: scryptParams.r,
        p: scryptParams.p,
        maxmem: 128 * scryptParams.N * scryptParams.r * 2,
      },
      (err, key) => (err ? reject(err) : resolve(`${salt}:${key.toString('hex')}`)),
    )
  })
}

export async function withDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: testDatabaseUrl })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}-${Date.now()}-${randomBytes(3).toString('hex')}@helpdesk.test`
}

export async function createUser(
  options: { role?: Role; email?: string; password?: string; name?: string } = {},
): Promise<TestUser> {
  const role = options.role ?? 'agent'
  const user: TestUser = {
    id: randomUUID(),
    // Better Auth stores emails lower-cased
    email: (options.email ?? uniqueEmail(role)).trim().toLowerCase(),
    password: options.password ?? `pw-${randomBytes(8).toString('hex')}`,
    name: options.name ?? `E2E ${role} ${randomBytes(2).toString('hex')}`,
    role,
  }
  const hash = await hashPassword(user.password)
  // Timestamp columns have no time zone and Prisma reads them as UTC, so write UTC, not the
  // DB session's local time
  await withDb(async (client) => {
    await client.query('BEGIN')
    try {
      await client.query(
        `INSERT INTO "user" (id, name, email, "emailVerified", role, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, true, $4, (now() AT TIME ZONE 'UTC'), (now() AT TIME ZONE 'UTC'))`,
        [user.id, user.name, user.email, user.role],
      )
      await client.query(
        `INSERT INTO account
           (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
         VALUES ($1, $2, 'credential', $2, $3, (now() AT TIME ZONE 'UTC'), (now() AT TIME ZONE 'UTC'))`,
        [randomUUID(), user.id, hash],
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  })
  return user
}

// Signs in through the real endpoint. With page.request this also signs in the page's context.
// Sends the Origin header a browser would, for when Better Auth's origin check is on.
export async function signInViaApi(request: APIRequestContext, email: string, password: string) {
  const response = await request.post('/api/auth/sign-in/email', {
    data: { email, password },
    headers: { Origin: clientUrl },
  })
  expect(response.status(), await response.text()).toBe(200)
  return response
}
