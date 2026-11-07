import { randomUUID } from 'node:crypto'
import { expect, request as playwrightRequest, test, type Page } from '@playwright/test'
import { createUser, signInViaApi, uniqueEmail, withDb, type TestUser } from '../helpers/users.ts'
import { adminStorageState, clientUrl, testAdmin } from '../test-env.ts'

type ApiUser = { id: string; email: string }

function userRow(page: Page, email: string) {
  return page.getByRole('row').filter({ has: page.getByRole('cell', { name: email, exact: true }) })
}

async function openDeleteDialog(page: Page, user: TestUser) {
  await page.goto('/users')
  await page.getByRole('button', { name: `Delete ${user.name}`, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete user' })
  await expect(dialog).toBeVisible()
  return dialog
}

// Counts DELETE requests to /api/users/* the page sends
function countDeletes(page: Page) {
  const counter = { calls: 0 }
  page.on('request', (req) => {
    if (req.method() === 'DELETE' && req.url().includes('/api/users/')) counter.calls++
  })
  return counter
}

async function storedUser(id: string) {
  const { rows } = await withDb((db) =>
    db.query<{ name: string; email: string; deleted: boolean }>(
      'SELECT name, email, "deletedAt" IS NOT NULL AS deleted FROM "user" WHERE id = $1',
      [id],
    ),
  )
  return rows[0]
}

async function sessionCount(userId: string): Promise<number> {
  const { rows } = await withDb((db) =>
    db.query<{ count: string }>('SELECT count(*) FROM session WHERE "userId" = $1', [userId]),
  )
  return Number(rows[0].count)
}

async function adminId(): Promise<string> {
  const { rows } = await withDb((db) =>
    db.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [testAdmin.email]),
  )
  return rows[0].id
}

// Tries a sign-in from a fresh, cookie-less context and returns the status code
async function signInStatus(email: string, password: string): Promise<number> {
  const context = await playwrightRequest.newContext({ baseURL: clientUrl })
  try {
    const response = await context.post('/api/auth/sign-in/email', {
      data: { email, password },
      headers: { Origin: clientUrl },
    })
    return response.status()
  } finally {
    await context.dispose()
  }
}

// Soft-deletes a user through the API with a fresh admin session
async function deleteViaApi(userId: string) {
  const context = await playwrightRequest.newContext({
    baseURL: clientUrl,
    storageState: adminStorageState,
  })
  try {
    const response = await context.delete(`/api/users/${userId}`)
    expect(response.status()).toBe(204)
  } finally {
    await context.dispose()
  }
}

test.describe('delete user as admin', () => {
  test.use({ storageState: adminStorageState })

  test('admin deletes an agent and the row is gone, but the user is only soft-deleted', async ({
    page,
  }) => {
    const agent = await createUser({ role: 'agent' })
    const dialog = await openDeleteDialog(page, agent)

    await expect(
      dialog.getByText(
        `${agent.name} (${agent.email}) will be signed out and won't be able to sign in again.`,
      ),
    ).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(dialog).toBeHidden()
    await expect(userRow(page, agent.email)).toHaveCount(0)
    // The admin row is still there
    await expect(userRow(page, testAdmin.email)).toHaveCount(1)

    await page.reload()
    await expect(page.getByRole('status', { name: 'Loading users' })).toBeHidden()
    await expect(userRow(page, testAdmin.email)).toHaveCount(1)
    await expect(userRow(page, agent.email)).toHaveCount(0)

    expect(await storedUser(agent.id)).toEqual({
      name: agent.name,
      email: agent.email,
      deleted: true,
    })
  })

  test('the Delete button reads "Deleting…" and is disabled while the request runs', async ({
    page,
  }) => {
    const agent = await createUser({ role: 'agent' })
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    await page.route(`**/api/users/${agent.id}`, async (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback()
      await released
      await route.continue()
    })
    const dialog = await openDeleteDialog(page, agent)

    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    const pending = dialog.getByRole('button', { name: 'Deleting…' })
    await expect(pending).toBeVisible()
    await expect(pending).toBeDisabled()

    release()
    await expect(dialog).toBeHidden()
    await expect(userRow(page, agent.email)).toHaveCount(0)
  })

  test('Cancel closes the dialog, sends no request and keeps the agent', async ({ page }) => {
    const agent = await createUser({ role: 'agent' })
    const deletes = countDeletes(page)
    const dialog = await openDeleteDialog(page, agent)

    await dialog.getByRole('button', { name: 'Cancel' }).click()

    await expect(dialog).toBeHidden()
    await expect(userRow(page, agent.email)).toHaveCount(1)
    await page.reload()
    await expect(userRow(page, agent.email)).toHaveCount(1)
    expect(deletes.calls).toBe(0)
    expect((await storedUser(agent.id)).deleted).toBe(false)
  })

  test('admin rows have no Delete button, only Edit', async ({ page }) => {
    const otherAdmin = await createUser({ role: 'admin' })
    await page.goto('/users')

    for (const admin of [{ name: testAdmin.name, email: testAdmin.email }, otherAdmin]) {
      const row = userRow(page, admin.email)
      await expect(
        row.getByRole('button', { name: `Edit ${admin.name}`, exact: true }),
      ).toBeVisible()
      await expect(row.getByRole('button', { name: /^Delete/ })).toHaveCount(0)
    }
  })

  test('deleting a user someone else already deleted shows an error and keeps the dialog open', async ({
    page,
  }) => {
    const agent = await createUser({ role: 'agent' })
    const dialog = await openDeleteDialog(page, agent)
    await deleteViaApi(agent.id)

    const deleted = page.waitForResponse(
      (res) => res.request().method() === 'DELETE' && res.url().endsWith(`/api/users/${agent.id}`),
    )
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    expect((await deleted).status()).toBe(404)

    await expect(dialog.getByRole('alert')).toHaveText('This user has already been deleted.')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled()
  })

  test('closing the dialog after an "already deleted" error removes the stale row', async ({
    page,
  }) => {
    const agent = await createUser({ role: 'agent' })
    const dialog = await openDeleteDialog(page, agent)
    await deleteViaApi(agent.id)

    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(dialog.getByRole('alert')).toHaveText('This user has already been deleted.')
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    await expect(dialog).toBeHidden()
    await expect(userRow(page, agent.email)).toHaveCount(0)
    await expect(userRow(page, testAdmin.email)).toHaveCount(1)
  })

  test('a 403 from the server shows "Admins can\'t be deleted." in the dialog', async ({
    page,
  }) => {
    const agent = await createUser({ role: 'agent' })
    await page.route(`**/api/users/${agent.id}`, (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({ status: 403, json: { error: 'Admins cannot be deleted' } })
        : route.fallback(),
    )
    const dialog = await openDeleteDialog(page, agent)

    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(dialog.getByRole('alert')).toHaveText("Admins can't be deleted.")
    await expect(dialog).toBeVisible()
  })

  test('an unexpected server error shows a retry message and keeps the dialog open', async ({
    page,
  }) => {
    const agent = await createUser({ role: 'agent' })
    await page.route(`**/api/users/${agent.id}`, (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({ status: 500, json: { error: 'Internal server error' } })
        : route.fallback(),
    )
    const dialog = await openDeleteDialog(page, agent)

    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(dialog.getByRole('alert')).toHaveText("Couldn't delete the user. Try again.")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled()

    // Closing and reopening starts without the old error
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await page.getByRole('button', { name: `Delete ${agent.name}`, exact: true }).click()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('alert')).toHaveCount(0)
    expect((await storedUser(agent.id)).deleted).toBe(false)
  })

  test("creating a user with a deleted agent's email shows an error on the Email field", async ({
    page,
  }) => {
    const agent = await createUser({ role: 'agent' })
    await deleteViaApi(agent.id)

    await page.goto('/users')
    await page.getByRole('button', { name: 'New user' }).click()
    const dialog = page.getByRole('dialog', { name: 'New user' })
    await dialog.getByLabel('Name').fill('Reused Email')
    await dialog.getByLabel('Email').fill(agent.email)
    await dialog.getByLabel('Password').fill('reused-email-password')
    await dialog.getByRole('button', { name: 'Create user' }).click()

    await expect(dialog.getByText('This email belongs to a deleted user')).toBeVisible()
    await expect(dialog.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog).toBeVisible()
    await expect(userRow(page, agent.email)).toHaveCount(0)
  })

  test("editing a user to a deleted agent's email shows an error on the Email field", async ({
    page,
  }) => {
    const deleted = await createUser({ role: 'agent' })
    const agent = await createUser({ role: 'agent' })
    await deleteViaApi(deleted.id)

    await page.goto('/users')
    await page.getByRole('button', { name: `Edit ${agent.name}`, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit user' })
    await dialog.getByLabel('Email').fill(deleted.email)
    await dialog.getByRole('button', { name: 'Save changes' }).click()

    await expect(dialog.getByText('This email belongs to a deleted user')).toBeVisible()
    await expect(dialog.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(await storedUser(agent.id)).toMatchObject({ email: agent.email })
  })
})

test.describe('deleted agent', () => {
  test('an existing session is signed out on the next navigation and API call', async ({
    browser,
  }) => {
    const agent = await createUser({ role: 'agent' })
    const agentContext = await browser.newContext({ storageState: undefined })
    try {
      const agentPage = await agentContext.newPage()
      await signInViaApi(agentPage.request, agent.email, agent.password)
      await agentPage.goto('/dashboard')
      await expect(agentPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
      expect(await sessionCount(agent.id)).toBeGreaterThan(0)

      await deleteViaApi(agent.id)

      expect(await sessionCount(agent.id)).toBe(0)
      expect((await agentPage.request.get('/api/me')).status()).toBe(401)
      await agentPage.goto('/dashboard')
      await expect(agentPage).toHaveURL(/\/login$/)
      await expect(agentPage.getByRole('button', { name: 'Sign in' })).toBeVisible()
    } finally {
      await agentContext.close()
    }
  })

  test('cannot sign in through the login page', async ({ page }) => {
    const agent = await createUser({ role: 'agent' })
    await deleteViaApi(agent.id)

    await page.goto('/login')
    await page.getByLabel('Email').fill(agent.email)
    await page.getByLabel('Password').fill(agent.password)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
    await expect(page).toHaveURL(/\/login$/)
    expect(await sessionCount(agent.id)).toBe(0)
  })

  test('cannot sign in through the API', async () => {
    const agent = await createUser({ role: 'agent' })
    expect(await signInStatus(agent.email, agent.password)).toBe(200)
    await deleteViaApi(agent.id)

    expect(await signInStatus(agent.email, agent.password)).toBe(401)
    expect(await sessionCount(agent.id)).toBe(0)
  })
})

test.describe('delete user API', () => {
  test('DELETE /api/users/:id returns 401 without a session', async ({ request }) => {
    const agent = await createUser({ role: 'agent' })

    const response = await request.delete(`/api/users/${agent.id}`)
    expect(response.status()).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect((await storedUser(agent.id)).deleted).toBe(false)
    expect(await signInStatus(agent.email, agent.password)).toBe(200)
  })

  test('DELETE /api/users/:id returns 403 for an agent', async ({ request }) => {
    const agent = await createUser({ role: 'agent' })
    const target = await createUser({ role: 'agent' })
    await signInViaApi(request, agent.email, agent.password)

    const response = await request.delete(`/api/users/${target.id}`)
    expect(response.status()).toBe(403)
    expect(await response.json()).toEqual({ error: 'Forbidden' })
    expect((await storedUser(target.id)).deleted).toBe(false)
    expect(await signInStatus(target.email, target.password)).toBe(200)
  })

  test.describe('with the admin session', () => {
    test.use({ storageState: adminStorageState })

    test('deleting an admin returns 403 and the admin stays listed', async ({ request }) => {
      const otherAdmin = await createUser({ role: 'admin' })
      const selfId = await adminId()

      for (const id of [selfId, otherAdmin.id]) {
        const response = await request.delete(`/api/users/${id}`)
        expect(response.status()).toBe(403)
        expect(await response.json()).toEqual({ error: 'Admins cannot be deleted' })
        expect((await storedUser(id)).deleted).toBe(false)
      }

      const { users } = (await (await request.get('/api/users')).json()) as { users: ApiUser[] }
      const ids = users.map((u) => u.id)
      expect(ids).toContain(selfId)
      expect(ids).toContain(otherAdmin.id)
      // The admin's own session still works
      expect((await request.get('/api/me')).status()).toBe(200)
    })

    test('deleting an agent returns 204 with no body and hides them from GET', async ({
      request,
    }) => {
      const agent = await createUser({ role: 'agent' })

      const response = await request.delete(`/api/users/${agent.id}`)
      expect(response.status()).toBe(204)
      expect(await response.body()).toHaveLength(0)

      const { users } = (await (await request.get('/api/users')).json()) as { users: ApiUser[] }
      expect(users.map((u) => u.id)).not.toContain(agent.id)
      expect((await storedUser(agent.id)).deleted).toBe(true)
    })

    test('deleting an already-deleted user returns 404', async ({ request }) => {
      const agent = await createUser({ role: 'agent' })
      expect((await request.delete(`/api/users/${agent.id}`)).status()).toBe(204)

      const response = await request.delete(`/api/users/${agent.id}`)
      expect(response.status()).toBe(404)
      expect(await response.json()).toEqual({ error: 'User not found' })
    })

    test('deleting an unknown user returns 404', async ({ request }) => {
      const response = await request.delete(`/api/users/${randomUUID()}`)
      expect(response.status()).toBe(404)
      expect(await response.json()).toEqual({ error: 'User not found' })
    })

    test('PATCH on a deleted user returns 404 and changes nothing', async ({ request }) => {
      const agent = await createUser({ role: 'agent' })
      await deleteViaApi(agent.id)

      const response = await request.patch(`/api/users/${agent.id}`, {
        data: { name: 'Revived User', email: uniqueEmail('revived') },
      })
      expect(response.status()).toBe(404)
      expect(await response.json()).toEqual({ error: 'User not found' })
      expect(await storedUser(agent.id)).toEqual({
        name: agent.name,
        email: agent.email,
        deleted: true,
      })
    })

    test("POST with a deleted user's email returns 409, and an active duplicate keeps its own message", async ({
      request,
    }) => {
      const deleted = await createUser({ role: 'agent' })
      const active = await createUser({ role: 'agent' })
      await deleteViaApi(deleted.id)

      const toDeleted = await request.post('/api/users', {
        data: { name: 'Reused Email', email: deleted.email, password: 'reused-password' },
      })
      expect(toDeleted.status()).toBe(409)
      expect(await toDeleted.json()).toEqual({ error: 'This email belongs to a deleted user' })

      const toActive = await request.post('/api/users', {
        data: { name: 'Duplicate Email', email: active.email, password: 'duplicate-password' },
      })
      expect(toActive.status()).toBe(409)
      expect(await toActive.json()).toEqual({ error: 'A user with this email already exists' })
    })
  })
})
