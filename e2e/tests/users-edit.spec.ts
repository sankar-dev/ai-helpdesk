import { expect, request as playwrightRequest, test, type Page } from '@playwright/test'
import { createUser, signInViaApi, uniqueEmail, withDb, type TestUser } from '../helpers/users.ts'
import { adminStorageState, clientUrl } from '../test-env.ts'

function userRow(page: Page, email: string) {
  return page.getByRole('row').filter({ has: page.getByRole('cell', { name: email, exact: true }) })
}

async function openEditDialog(page: Page, user: TestUser) {
  await page.goto('/users')
  await page.getByRole('button', { name: `Edit ${user.name}`, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit user' })
  await expect(dialog).toBeVisible()
  return dialog
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

async function storedUser(id: string) {
  const { rows } = await withDb((db) =>
    db.query<{ name: string; email: string }>('SELECT name, email FROM "user" WHERE id = $1', [id]),
  )
  return rows[0]
}

test.describe('edit user as admin', () => {
  test.use({ storageState: adminStorageState })

  test('admin edits an agent name and email and the table shows the new values', async ({
    page,
  }) => {
    const agent = await createUser({ role: 'agent' })
    const dialog = await openEditDialog(page, agent)

    await expect(dialog.getByLabel('Name')).toHaveValue(agent.name)
    await expect(dialog.getByLabel('Email')).toHaveValue(agent.email)
    await expect(dialog.getByLabel('New password')).toHaveValue('')
    await expect(dialog.getByText('Leave blank to keep the current password.')).toBeVisible()

    const newName = `Renamed ${Date.now()}`
    const newEmail = uniqueEmail('renamed')
    await dialog.getByLabel('Name').fill(newName)
    // Mixed case: the server stores emails lower-cased
    await dialog.getByLabel('Email').fill(newEmail.toUpperCase())
    await dialog.getByRole('button', { name: 'Save changes' }).click()

    await expect(dialog).toBeHidden()
    const row = userRow(page, newEmail)
    await expect(row.getByRole('cell').first()).toHaveText(newName)
    await expect(userRow(page, agent.email)).toHaveCount(0)

    await page.reload()
    await expect(userRow(page, newEmail).getByRole('cell').first()).toHaveText(newName)
    await expect(userRow(page, agent.email)).toHaveCount(0)
    expect(await storedUser(agent.id)).toEqual({ name: newName, email: newEmail })
  })

  test('admin sets a new password and the agent signs in only with the new one', async ({
    page,
  }) => {
    const agent = await createUser({ role: 'agent' })
    const newPassword = `new-pw-${Date.now()}`
    const dialog = await openEditDialog(page, agent)

    await dialog.getByLabel('New password').fill(newPassword)
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()

    expect(await signInStatus(agent.email, newPassword)).toBe(200)
    expect(await signInStatus(agent.email, agent.password)).toBe(401)
  })

  test('saving with the password left blank keeps the original password', async ({ page }) => {
    const agent = await createUser({ role: 'agent' })
    const newName = `Kept password ${Date.now()}`
    const dialog = await openEditDialog(page, agent)

    await dialog.getByLabel('Name').fill(newName)
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()
    await expect(userRow(page, agent.email).getByRole('cell').first()).toHaveText(newName)

    expect(await signInStatus(agent.email, agent.password)).toBe(200)
  })

  test('a password change signs the agent out of their existing session', async ({
    page,
    browser,
  }) => {
    const agent = await createUser({ role: 'agent' })
    const agentContext = await browser.newContext({ storageState: undefined })
    try {
      const agentPage = await agentContext.newPage()
      await signInViaApi(agentPage.request, agent.email, agent.password)
      await agentPage.goto('/dashboard')
      await expect(agentPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

      const dialog = await openEditDialog(page, agent)
      await dialog.getByLabel('New password').fill(`reset-pw-${Date.now()}`)
      await dialog.getByRole('button', { name: 'Save changes' }).click()
      await expect(dialog).toBeHidden()

      expect((await agentPage.request.get('/api/me')).status()).toBe(401)
      await agentPage.goto('/dashboard')
      await expect(agentPage).toHaveURL(/\/login$/)

      // The admin's own session survives the reset
      await page.reload()
      await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible()
      expect((await page.request.get('/api/me')).status()).toBe(200)
    } finally {
      await agentContext.close()
    }
  })

  test('changing the email to one another user has shows an error and keeps the dialog open', async ({
    page,
  }) => {
    const agent = await createUser({ role: 'agent' })
    const other = await createUser({ role: 'agent' })
    const dialog = await openEditDialog(page, agent)

    await dialog.getByLabel('Email').fill(other.email)
    await dialog.getByRole('button', { name: 'Save changes' }).click()

    await expect(dialog.getByText('A user with this email already exists')).toBeVisible()
    await expect(dialog.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    expect(await storedUser(agent.id)).toEqual({ name: agent.name, email: agent.email })
  })

  test('a short password shows a validation error and nothing is saved', async ({ page }) => {
    const agent = await createUser({ role: 'agent' })
    let patchCalls = 0
    page.on('request', (req) => {
      if (req.method() === 'PATCH' && req.url().includes('/api/users/')) patchCalls++
    })
    const dialog = await openEditDialog(page, agent)

    await dialog.getByLabel('Name').fill(`Should not save ${Date.now()}`)
    await dialog.getByLabel('New password').fill('short')
    await dialog.getByRole('button', { name: 'Save changes' }).click()

    await expect(dialog.getByText('Password must be at least 8 characters')).toBeVisible()
    await expect(dialog.getByLabel('New password')).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog).toBeVisible()
    expect(patchCalls).toBe(0)
    expect(await storedUser(agent.id)).toEqual({ name: agent.name, email: agent.email })
    expect(await signInStatus(agent.email, agent.password)).toBe(200)
  })
})

test.describe('edit user API', () => {
  test('PATCH /api/users/:id returns 401 without a session', async ({ request }) => {
    const agent = await createUser({ role: 'agent' })
    const response = await request.patch(`/api/users/${agent.id}`, {
      data: { name: 'No Session', email: uniqueEmail('nosession') },
    })
    expect(response.status()).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(await storedUser(agent.id)).toEqual({ name: agent.name, email: agent.email })
  })

  test('PATCH /api/users/:id returns 403 for an agent', async ({ request }) => {
    const agent = await createUser({ role: 'agent' })
    const target = await createUser({ role: 'agent' })
    await signInViaApi(request, agent.email, agent.password)

    const response = await request.patch(`/api/users/${target.id}`, {
      data: { name: 'Hijacked', email: uniqueEmail('hijack'), password: 'hijacked-password' },
    })
    expect(response.status()).toBe(403)
    expect(await response.json()).toEqual({ error: 'Forbidden' })
    expect(await storedUser(target.id)).toEqual({ name: target.name, email: target.email })
    expect(await signInStatus(target.email, target.password)).toBe(200)
  })
})
