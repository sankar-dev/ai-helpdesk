import { expect, test } from '@playwright/test'
import { adminStorageState, testAdmin } from '../test-env.ts'

// Checks that the e2e setup works: client, API, and the seeded test database
test('API is up and connected to the database', async ({ request }) => {
  const response = await request.get('/api/health')
  expect(response.ok()).toBe(true)
  expect(await response.json()).toEqual({ status: 'ok', database: 'connected' })
})

test('seeded admin can sign in', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(testAdmin.email)
  await page.getByLabel('Password').fill(testAdmin.password)
  await page.getByRole('button', { name: /sign in/i }).click()

  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('link', { name: 'Users' })).toBeVisible()
})

test.describe('with the saved admin session', () => {
  test.use({ storageState: adminStorageState })

  test('opens an admin page without signing in', async ({ page }) => {
    await page.goto('/users')
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
  })
})
