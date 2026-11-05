import { expect, test } from '@playwright/test'
import { createUser, signInViaApi } from '../helpers/users.ts'
import { adminStorageState } from '../test-env.ts'

test.describe('sidebar logo', () => {
  test.describe('as admin', () => {
    test.use({ storageState: adminStorageState })

    test('clicking the Helpdesk logo on /users goes to /dashboard', async ({ page }) => {
      await page.goto('/users')
      await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible()

      await page.getByRole('link', { name: 'Helpdesk', exact: true }).click()

      await expect(page).toHaveURL(/\/dashboard$/)
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    })
  })

  test('agent clicking the Helpdesk logo on /tickets goes to /dashboard', async ({ page }) => {
    const agent = await createUser({ role: 'agent' })
    await signInViaApi(page.request, agent.email, agent.password)
    await page.goto('/tickets')
    await expect(page).toHaveURL(/\/tickets$/)

    await page.getByRole('link', { name: 'Helpdesk', exact: true }).click()

    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })
})
