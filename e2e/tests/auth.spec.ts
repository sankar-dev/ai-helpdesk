import { expect, test, type Page } from '@playwright/test'
import { createUser, signInViaApi, uniqueEmail, withDb } from '../helpers/users.ts'
import { adminStorageState, clientUrl, testAdmin } from '../test-env.ts'

const sessionCookieName = 'better-auth.session_token'

async function fillLogin(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test.describe('login page', () => {
  test('agent with valid credentials lands on the dashboard', async ({ page }) => {
    const agent = await createUser({ role: 'agent' })
    await page.goto('/login')
    await fillLogin(page, agent.email, agent.password)

    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByText(agent.name)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  test('wrong password shows a generic error and stays on /login', async ({ page }) => {
    const agent = await createUser()
    await page.goto('/login')
    await fillLogin(page, agent.email, `${agent.password}-wrong`)

    await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  test('unknown email shows the same generic error as a wrong password', async ({ page }) => {
    await page.goto('/login')
    await fillLogin(page, uniqueEmail('nobody'), 'some-password-123')

    await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('empty form shows field errors and does not call the API', async ({ page }) => {
    let signInCalls = 0
    page.on('request', (req) => {
      if (req.url().includes('/api/auth/sign-in')) signInCalls++
    })
    await page.goto('/login')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByText('Enter a valid email address')).toBeVisible()
    await expect(page.getByText('Enter your password')).toBeVisible()
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByLabel('Password')).toHaveAttribute('aria-invalid', 'true')
    await expect(page).toHaveURL(/\/login$/)
    expect(signInCalls).toBe(0)
  })

  test('malformed email shows a validation error', async ({ page }) => {
    await page.goto('/login')
    await fillLogin(page, 'not-an-email', 'whatever-123')

    await expect(page.getByText('Enter a valid email address')).toBeVisible()
    await expect(page.getByText('Enter your password')).toBeHidden()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('missing password shows only the password error', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(testAdmin.email)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByText('Enter your password')).toBeVisible()
    await expect(page.getByText('Enter a valid email address')).toBeHidden()
  })

  test('email is case-insensitive', async ({ page }) => {
    const agent = await createUser()
    await page.goto('/login')
    await fillLogin(page, agent.email.toUpperCase(), agent.password)

    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('surrounding whitespace in the email is ignored', async ({ page }) => {
    const agent = await createUser()
    await page.goto('/login')
    await fillLogin(page, `  ${agent.email}  `, agent.password)

    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('password is exact: case and trailing spaces matter', async ({ page }) => {
    const agent = await createUser({ password: 'Exact-Password-123' })
    await page.goto('/login')

    await fillLogin(page, agent.email, 'exact-password-123')
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password')

    await fillLogin(page, agent.email, 'Exact-Password-123 ')
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('can sign in after a failed attempt', async ({ page }) => {
    const agent = await createUser()
    await page.goto('/login')
    await fillLogin(page, agent.email, 'wrong-password-1')
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password')

    await page.getByLabel('Password').fill(agent.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('password field masks its input', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByLabel('Password')).toHaveAttribute('type', 'password')
  })

  test.describe('when already signed in', () => {
    test.use({ storageState: adminStorageState })

    test('visiting /login redirects to /dashboard', async ({ page }) => {
      await page.goto('/login')
      await expect(page).toHaveURL(/\/dashboard$/)
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    })
  })
})

test.describe('protected routes without a session', () => {
  for (const path of ['/', '/dashboard', '/tickets', '/tickets/123', '/users']) {
    test(`${path} redirects to /login`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login$/)
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Sign out' })).toBeHidden()
    })
  }

  test('a tampered session cookie is treated as signed out', async ({ context, page }) => {
    await context.addCookies([
      { name: sessionCookieName, value: 'forged-token.forged-signature', url: clientUrl },
    ])
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login$/)
  })
})

test.describe('session', () => {
  test('session cookie is httpOnly and SameSite=Lax', async ({ context, page }) => {
    const agent = await createUser()
    await page.goto('/login')
    await fillLogin(page, agent.email, agent.password)
    await expect(page).toHaveURL(/\/dashboard$/)

    const cookie = (await context.cookies()).find((c) => c.name === sessionCookieName)
    expect(cookie, 'session cookie should be set').toBeDefined()
    expect(cookie!.httpOnly).toBe(true)
    expect(cookie!.sameSite).toBe('Lax')
    // Script on the page must not be able to read it
    expect(await page.evaluate(() => document.cookie)).not.toContain(sessionCookieName)
  })

  test('session survives a reload and is shared with new tabs', async ({ context, page }) => {
    const agent = await createUser()
    await page.goto('/login')
    await fillLogin(page, agent.email, agent.password)
    await expect(page).toHaveURL(/\/dashboard$/)

    await page.reload()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByText(agent.name)).toBeVisible()

    const secondTab = await context.newPage()
    await secondTab.goto('/tickets')
    await expect(secondTab).toHaveURL(/\/tickets$/)
    await expect(secondTab.getByRole('heading', { name: 'Tickets' })).toBeVisible()
  })

  test('a session is not shared with a separate browser context', async ({ browser, page }) => {
    const agent = await createUser()
    await signInViaApi(page.request, agent.email, agent.password)
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard$/)

    const other = await browser.newContext()
    try {
      const otherPage = await other.newPage()
      await otherPage.goto('/dashboard')
      await expect(otherPage).toHaveURL(/\/login$/)
    } finally {
      await other.close()
    }
  })

  test('an expired session redirects to /login', async ({ page }) => {
    const agent = await createUser()
    await signInViaApi(page.request, agent.email, agent.password)
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    await withDb((db) =>
      db.query(
        `UPDATE session SET "expiresAt" = (now() AT TIME ZONE 'UTC') - interval '1 minute' WHERE "userId" = $1`,
        [agent.id],
      ),
    )

    expect((await page.request.get('/api/me')).status()).toBe(401)
    await page.reload()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('deleting a user ends their session immediately', async ({ page }) => {
    const agent = await createUser()
    await signInViaApi(page.request, agent.email, agent.password)
    expect((await page.request.get('/api/me')).status()).toBe(200)

    await withDb((db) => db.query('DELETE FROM "user" WHERE id = $1', [agent.id]))

    expect((await page.request.get('/api/me')).status()).toBe(401)
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login$/)
  })
})

test.describe('sign out', () => {
  test('signs out, redirects to /login, and blocks protected pages', async ({ context, page }) => {
    const agent = await createUser()
    await page.goto('/login')
    await fillLogin(page, agent.email, agent.password)
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.getByRole('link', { name: 'Tickets' }).click()
    await expect(page).toHaveURL(/\/tickets$/)

    const oldCookie = (await context.cookies()).find((c) => c.name === sessionCookieName)
    expect(oldCookie).toBeDefined()

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()

    // Browser cookie is cleared
    expect((await context.cookies()).find((c) => c.name === sessionCookieName)).toBeUndefined()

    // Back button must not restore access
    await page.goBack()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeHidden()

    await page.goto('/tickets')
    await expect(page).toHaveURL(/\/login$/)
    expect((await page.request.get('/api/me')).status()).toBe(401)
  })

  test('the old session token is revoked on the server', async ({ browser, context, page }) => {
    const agent = await createUser()
    await signInViaApi(page.request, agent.email, agent.password)
    await page.goto('/dashboard')
    const oldCookie = (await context.cookies()).find((c) => c.name === sessionCookieName)!

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)

    // Replaying the stolen cookie in a fresh context must fail
    const replay = await browser.newContext()
    try {
      await replay.addCookies([oldCookie])
      expect((await replay.request.get('/api/me')).status()).toBe(401)
    } finally {
      await replay.close()
    }
    const { rows } = await withDb((db) =>
      db.query('SELECT 1 FROM session WHERE "userId" = $1', [agent.id]),
    )
    expect(rows).toHaveLength(0)
  })

  test('signing out in one tab signs out the other tab on its next load', async ({
    context,
    page,
  }) => {
    const agent = await createUser()
    await signInViaApi(page.request, agent.email, agent.password)
    await page.goto('/dashboard')
    const secondTab = await context.newPage()
    await secondTab.goto('/tickets')
    await expect(secondTab.getByRole('heading', { name: 'Tickets' })).toBeVisible()

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await secondTab.reload()
    await expect(secondTab).toHaveURL(/\/login$/)
  })

  test("signing out one browser does not end the same user's other sessions", async ({
    browser,
    page,
  }) => {
    const agent = await createUser()
    await signInViaApi(page.request, agent.email, agent.password)
    const other = await browser.newContext()
    try {
      await signInViaApi(other.request, agent.email, agent.password)

      await page.goto('/dashboard')
      await page.getByRole('button', { name: 'Sign out' }).click()
      await expect(page).toHaveURL(/\/login$/)

      expect((await other.request.get('/api/me')).status()).toBe(200)
    } finally {
      await other.close()
    }
  })
})

test.describe('admin-only pages', () => {
  test.describe('as admin', () => {
    test.use({ storageState: adminStorageState })

    test('admin sees the Users link and can open /users', async ({ page }) => {
      await page.goto('/dashboard')
      await page.getByRole('link', { name: 'Users' }).click()
      await expect(page).toHaveURL(/\/users$/)
      await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
    })
  })

  test.describe('as agent', () => {
    test('agent does not see the Users link', async ({ page }) => {
      const agent = await createUser({ role: 'agent' })
      await signInViaApi(page.request, agent.email, agent.password)
      await page.goto('/dashboard')

      await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Tickets' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0)
    })

    test('agent is redirected away from /users', async ({ page }) => {
      const agent = await createUser({ role: 'agent' })
      await signInViaApi(page.request, agent.email, agent.password)
      await page.goto('/users')

      await expect(page).toHaveURL(/\/dashboard$/)
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Users' })).toHaveCount(0)
    })
  })
})

test.describe('auth API', () => {
  test('GET /api/me returns 401 without a session', async ({ request }) => {
    const response = await request.get('/api/me')
    expect(response.status()).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  test('GET /api/me returns 401 for invalid session cookies', async ({ playwright }) => {
    const admin = await playwright.request.newContext({
      baseURL: clientUrl,
      storageState: adminStorageState,
    })
    const real = (await admin.storageState()).cookies.find((c) => c.name === sessionCookieName)!
    await admin.dispose()
    const [token] = decodeURIComponent(real.value).split('.')

    const values = [
      'garbage',
      'forged-token.forged-signature',
      // The real token with a forged signature
      `${token}.${'A'.repeat(43)}=`,
      // The real token with no signature
      token,
    ]
    for (const value of values) {
      const ctx = await playwright.request.newContext({
        baseURL: clientUrl,
        extraHTTPHeaders: { Cookie: `${sessionCookieName}=${encodeURIComponent(value)}` },
      })
      try {
        expect((await ctx.get('/api/me')).status(), `cookie value: ${value}`).toBe(401)
      } finally {
        await ctx.dispose()
      }
    }
  })

  test.describe('with the admin session', () => {
    test.use({ storageState: adminStorageState })

    test('GET /api/me returns the admin with role', async ({ request }) => {
      const response = await request.get('/api/me')
      expect(response.status()).toBe(200)
      const { user } = await response.json()
      expect(user).toMatchObject({ email: testAdmin.email, name: testAdmin.name, role: 'admin' })
      expect(user).not.toHaveProperty('password')
    })
  })

  test('GET /api/me returns an agent with role agent', async ({ request }) => {
    const agent = await createUser({ role: 'agent' })
    await signInViaApi(request, agent.email, agent.password)

    const { user } = await (await request.get('/api/me')).json()
    expect(user).toMatchObject({
      id: agent.id,
      email: agent.email,
      name: agent.name,
      role: 'agent',
    })
  })

  test('sign-in responds identically for unknown email and wrong password', async ({ request }) => {
    const agent = await createUser()
    const post = (email: string, password: string) =>
      request.post('/api/auth/sign-in/email', {
        data: { email, password },
        headers: { Origin: clientUrl },
      })

    const wrongPassword = await post(agent.email, 'definitely-wrong-1')
    const unknownEmail = await post(uniqueEmail('ghost'), 'definitely-wrong-1')

    expect(wrongPassword.status()).toBe(401)
    expect(unknownEmail.status()).toBe(401)
    expect(await unknownEmail.json()).toEqual(await wrongPassword.json())
    expect(wrongPassword.headers()['set-cookie']).toBeUndefined()
    expect(unknownEmail.headers()['set-cookie']).toBeUndefined()
  })

  test('public sign-up is rejected and creates no user', async ({ request }) => {
    const email = uniqueEmail('signup')
    const response = await request.post('/api/auth/sign-up/email', {
      data: { email, password: 'sign-up-password-123', name: 'Sneaky', role: 'admin' },
      headers: { Origin: clientUrl },
    })
    expect(response.ok()).toBe(false)
    expect(response.status()).toBeGreaterThanOrEqual(400)
    expect(response.status()).toBeLessThan(500)

    const { rows } = await withDb((db) =>
      db.query('SELECT 1 FROM "user" WHERE email = $1', [email]),
    )
    expect(rows).toHaveLength(0)
    expect((await request.get('/api/me')).status()).toBe(401)
  })

  test('an agent cannot promote themselves to admin', async ({ request }) => {
    const agent = await createUser({ role: 'agent' })
    await signInViaApi(request, agent.email, agent.password)

    await request.post('/api/auth/update-user', {
      data: { role: 'admin' },
      headers: { Origin: clientUrl },
    })

    const { user } = await (await request.get('/api/me')).json()
    expect(user.role).toBe('agent')
    const { rows } = await withDb((db) =>
      db.query<{ role: string }>('SELECT role FROM "user" WHERE id = $1', [agent.id]),
    )
    expect(rows[0].role).toBe('agent')
  })

  // Better Auth turns off its origin/CSRF checks when NODE_ENV=test (skipOriginCheck defaults to
  // isTest()), and serverTestEnv sets NODE_ENV=test, so this cannot pass in the e2e environment yet
  test.fixme('cookie-bearing request from an untrusted origin is rejected', async ({ request }) => {
    const agent = await createUser()
    await signInViaApi(request, agent.email, agent.password)

    const response = await request.post('/api/auth/sign-out', {
      headers: { Origin: 'http://evil.example' },
    })
    expect(response.status()).toBe(403)
    expect((await request.get('/api/me')).status()).toBe(200)
  })
})
