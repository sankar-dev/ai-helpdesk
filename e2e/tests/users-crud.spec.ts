import { randomBytes } from 'node:crypto'
import { expect, request as playwrightRequest, test, type Page } from '@playwright/test'
import { uniqueEmail, withDb } from '../helpers/users.ts'
import { adminStorageState, clientUrl } from '../test-env.ts'

type UserDetails = { name: string; email: string; password: string }

function userRow(page: Page, email: string) {
  return page.getByRole('row').filter({ has: page.getByRole('cell', { name: email, exact: true }) })
}

// The Created column uses the browser's locale, so format today's date there too
async function today(page: Page) {
  return page.evaluate(() => new Date().toLocaleDateString())
}

// Mixed-case email in the form; the server stores it lower-cased
function newUserDetails(prefix: string): UserDetails {
  const suffix = `${Date.now()}-${randomBytes(2).toString('hex')}`
  return {
    name: `E2E ${prefix} ${suffix}`,
    email: uniqueEmail(prefix).replace(prefix, prefix.toUpperCase()),
    password: `pw-${randomBytes(8).toString('hex')}`,
  }
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

async function storedUser(email: string) {
  const { rows } = await withDb((db) =>
    db.query<{ name: string; role: string; deleted: boolean }>(
      'SELECT name, role, "deletedAt" IS NOT NULL AS deleted FROM "user" WHERE email = $1',
      [email],
    ),
  )
  return rows[0]
}

async function createViaDialog(page: Page, user: UserDetails) {
  await page.getByRole('button', { name: 'New user' }).click()
  const dialog = page.getByRole('dialog', { name: 'New user' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('New users are created with the agent role.')).toBeVisible()

  await dialog.getByLabel('Name').fill(user.name)
  await dialog.getByLabel('Email').fill(user.email)
  await dialog.getByLabel('Password').fill(user.password)
  await dialog.getByRole('button', { name: 'Create user' }).click()
  await expect(dialog).toBeHidden()
}

async function expectAgentRow(page: Page, name: string, email: string) {
  const row = userRow(page, email)
  await expect(row).toHaveCount(1)
  // The last cell holds the icon-only Edit and Delete buttons
  await expect(row.getByRole('cell')).toHaveText([name, email, 'agent', await today(page), ''])
  await expect(row.getByRole('button', { name: `Edit ${name}`, exact: true })).toBeVisible()
  await expect(row.getByRole('button', { name: `Delete ${name}`, exact: true })).toBeVisible()
}

test.describe('user management as admin', () => {
  test.use({ storageState: adminStorageState })

  test('admin creates an agent through the New user dialog and the agent can sign in', async ({
    page,
  }) => {
    const user = newUserDetails('created')
    const email = user.email.toLowerCase()
    await page.goto('/users')
    await expect(page.getByRole('status', { name: 'Loading users' })).toBeHidden()

    await createViaDialog(page, user)

    await expectAgentRow(page, user.name, email)
    await page.reload()
    await expectAgentRow(page, user.name, email)

    expect(await storedUser(email)).toEqual({ name: user.name, role: 'agent', deleted: false })
    expect(await signInStatus(email, user.password)).toBe(200)
  })

  test('admin creates, reads, updates and deletes one agent through the UI', async ({ page }) => {
    const original = newUserDetails('journey')
    const originalEmail = original.email.toLowerCase()
    const updated = newUserDetails('journey-updated')
    const updatedEmail = updated.email.toLowerCase()

    await test.step('create', async () => {
      await page.goto('/users')
      await expect(page.getByRole('status', { name: 'Loading users' })).toBeHidden()
      await createViaDialog(page, original)
    })

    await test.step('read', async () => {
      await expectAgentRow(page, original.name, originalEmail)
      await page.reload()
      await expectAgentRow(page, original.name, originalEmail)
      expect(await signInStatus(originalEmail, original.password)).toBe(200)
    })

    await test.step('update', async () => {
      await page.getByRole('button', { name: `Edit ${original.name}`, exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Edit user' })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByLabel('Name')).toHaveValue(original.name)
      await expect(dialog.getByLabel('Email')).toHaveValue(originalEmail)
      await expect(dialog.getByLabel('New password')).toHaveValue('')

      await dialog.getByLabel('Name').fill(updated.name)
      await dialog.getByLabel('Email').fill(updated.email)
      await dialog.getByLabel('New password').fill(updated.password)
      await dialog.getByRole('button', { name: 'Save changes' }).click()
      await expect(dialog).toBeHidden()

      await expectAgentRow(page, updated.name, updatedEmail)
      await expect(userRow(page, originalEmail)).toHaveCount(0)
      await page.reload()
      await expectAgentRow(page, updated.name, updatedEmail)
      await expect(userRow(page, originalEmail)).toHaveCount(0)

      expect(await signInStatus(updatedEmail, updated.password)).toBe(200)
      expect(await signInStatus(originalEmail, original.password)).toBe(401)
      expect(await signInStatus(updatedEmail, original.password)).toBe(401)
    })

    await test.step('delete', async () => {
      await page.getByRole('button', { name: `Delete ${updated.name}`, exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Delete user' })
      await expect(dialog).toBeVisible()
      await expect(
        dialog.getByText(
          `${updated.name} (${updatedEmail}) will be signed out and won't be able to sign in again.`,
        ),
      ).toBeVisible()
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(dialog).toBeHidden()

      await expect(userRow(page, updatedEmail)).toHaveCount(0)
      await page.reload()
      await expect(page.getByRole('status', { name: 'Loading users' })).toBeHidden()
      await expect(page.getByRole('row').nth(1)).toBeVisible()
      await expect(userRow(page, updatedEmail)).toHaveCount(0)

      expect(await storedUser(updatedEmail)).toEqual({
        name: updated.name,
        role: 'agent',
        deleted: true,
      })
      expect(await signInStatus(updatedEmail, updated.password)).toBe(401)
    })
  })
})
