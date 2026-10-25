import { expect, test, type Page } from '@playwright/test'
import { createUser, signInViaApi, withDb, type TestUser } from '../helpers/users.ts'
import { adminStorageState, testAdmin } from '../test-env.ts'

type ApiUser = { id: string; name: string; email: string; role: string; createdAt: string }

function userRow(page: Page, email: string) {
  return page.getByRole('row').filter({ has: page.getByRole('cell', { name: email, exact: true }) })
}

// The Created column uses the browser's locale, so format the date there too
async function localDate(page: Page, iso: string) {
  return page.evaluate((value) => new Date(value).toLocaleDateString(), iso)
}

// The column has no time zone and Prisma reads it as UTC; node-pg would parse it as local time
async function createdAt(userId: string): Promise<string> {
  const { rows } = await withDb((db) =>
    db.query<{ iso: string }>(
      `SELECT to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS iso FROM "user" WHERE id = $1`,
      [userId],
    ),
  )
  return rows[0].iso
}

async function expectRow(
  page: Page,
  user: { id: string; name: string; email: string; role: string },
) {
  const row = userRow(page, user.email)
  await expect(row).toHaveCount(1)
  await expect(row.getByRole('cell')).toHaveText([
    user.name,
    user.email,
    user.role,
    await localDate(page, await createdAt(user.id)),
  ])
}

test.describe('users page as admin', () => {
  test.use({ storageState: adminStorageState })

  let agent: TestUser

  test.beforeEach(async () => {
    agent = await createUser({ role: 'agent' })
  })

  test('admin opens Users from the sidebar and sees the admin and an agent', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('link', { name: 'Users' }).click()

    await expect(page).toHaveURL(/\/users$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible()
    await expect(page.getByRole('columnheader')).toHaveText(['Name', 'Email', 'Role', 'Created'])

    const { rows } = await withDb((db) =>
      db.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [testAdmin.email]),
    )
    await expectRow(page, {
      id: rows[0].id,
      name: testAdmin.name,
      email: testAdmin.email,
      role: 'admin',
    })
    await expectRow(page, agent)
  })

  test('admin opening /users directly sees a newly created agent', async ({ page }) => {
    await page.goto('/users')

    await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible()
    await expectRow(page, agent)
    await expect(page.getByText('Loading users…')).toBeHidden()
  })

  test('shows an error message when the users request fails', async ({ page }) => {
    await page.route('**/api/users', (route) =>
      route.fulfill({ status: 500, json: { error: 'Internal server error' } }),
    )
    await page.goto('/users')

    // TanStack Query retries 5xx responses with backoff before showing the error
    await expect(page.getByText('Loading users…')).toBeVisible()
    await expect(page.getByText("Couldn't load users.")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('table')).toHaveCount(0)
  })

  test('shows an empty state when there are no users', async ({ page }) => {
    await page.route('**/api/users', (route) => route.fulfill({ json: { users: [] } }))
    await page.goto('/users')

    await expect(page.getByText('No users yet.')).toBeVisible()
    await expect(page.getByRole('table')).toHaveCount(0)
  })
})

test.describe('users page as agent', () => {
  test('agent visiting /users is redirected to /dashboard without a Users link', async ({
    page,
  }) => {
    const agent = await createUser({ role: 'agent' })
    await signInViaApi(page.request, agent.email, agent.password)
    await page.goto('/users')

    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Tickets' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0)
    await expect(page.getByRole('table')).toHaveCount(0)
  })
})

test.describe('users API', () => {
  test('GET /api/users returns 401 without a session', async ({ request }) => {
    const response = await request.get('/api/users')
    expect(response.status()).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  test('GET /api/users returns 403 for an agent', async ({ request }) => {
    const agent = await createUser({ role: 'agent' })
    await signInViaApi(request, agent.email, agent.password)

    const response = await request.get('/api/users')
    expect(response.status()).toBe(403)
    expect(await response.json()).toEqual({ error: 'Forbidden' })
  })

  test.describe('with the admin session', () => {
    test.use({ storageState: adminStorageState })

    test('GET /api/users returns all users, oldest first, without secrets', async ({ request }) => {
      const first = await createUser({ role: 'agent' })
      const second = await createUser({ role: 'admin' })

      const response = await request.get('/api/users')
      expect(response.status()).toBe(200)
      const { users } = (await response.json()) as { users: ApiUser[] }

      for (const user of users) {
        expect(Object.keys(user).sort()).toEqual(['createdAt', 'email', 'id', 'name', 'role'])
      }
      expect(users).toContainEqual(
        expect.objectContaining({ email: testAdmin.email, name: testAdmin.name, role: 'admin' }),
      )
      for (const created of [first, second]) {
        expect(users).toContainEqual({
          id: created.id,
          name: created.name,
          email: created.email,
          role: created.role,
          createdAt: await createdAt(created.id),
        })
      }

      const times = users.map((u) => Date.parse(u.createdAt))
      expect(times).toEqual([...times].sort((a, b) => a - b))
      const ids = users.map((u) => u.id)
      expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(second.id))
    })
  })
})
