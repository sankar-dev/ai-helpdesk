import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { auth } from '../auth/auth.js'
import { Role } from '../generated/prisma/enums.js'
import { fakeSession, mockSession } from '../test/session.js'

const { findMany, findUnique, create, update } = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}))

vi.mock('../db.js', () => ({
  prisma: { user: { findMany, findUnique, create, update } },
}))

const { createApp } = await import('../app.js')

describe('POST /api/users', () => {
  const body = { name: 'Sam Agent', email: 'sam@example.com', password: 'correct-horse' }
  const createdAt = new Date('2026-10-01T12:00:00Z')

  beforeEach(() => {
    findUnique.mockReset()
    findUnique.mockResolvedValue(null)
    create.mockReset()
    create.mockResolvedValue({
      id: 'new-id',
      name: body.name,
      email: body.email,
      role: Role.agent,
      createdAt,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 401 without a session', async () => {
    mockSession(null)

    const res = await request(createApp()).post('/api/users').send(body)

    expect(res.status).toBe(401)
    expect(create).not.toHaveBeenCalled()
  })

  it('returns 403 for an agent', async () => {
    mockSession(fakeSession(Role.agent))

    const res = await request(createApp()).post('/api/users').send(body)

    expect(res.status).toBe(403)
    expect(create).not.toHaveBeenCalled()
  })

  it('creates a user with a hashed credential account and returns only safe fields', async () => {
    mockSession(fakeSession(Role.admin))

    const res = await request(createApp()).post('/api/users').send(body)

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      user: {
        id: 'new-id',
        name: body.name,
        email: body.email,
        role: 'agent',
        createdAt: createdAt.toISOString(),
      },
    })

    const { data, select } = create.mock.calls[0][0]
    expect(select).toEqual({ id: true, name: true, email: true, role: true, createdAt: true })
    expect(data).toMatchObject({ name: body.name, email: body.email, emailVerified: true })
    const account = data.accounts.create
    expect(account.providerId).toBe('credential')
    expect(account.accountId).toBe(data.id)
    expect(account.password).not.toBe(body.password)
    const ctx = await auth.$context
    await expect(
      ctx.password.verify({ hash: account.password, password: body.password }),
    ).resolves.toBe(true)
  })

  it('ignores a role sent by the client', async () => {
    mockSession(fakeSession(Role.admin))

    await request(createApp())
      .post('/api/users')
      .send({ ...body, role: Role.admin })

    expect(create.mock.calls[0][0].data).not.toHaveProperty('role')
  })

  it('trims the name and normalises the email', async () => {
    mockSession(fakeSession(Role.admin))

    await request(createApp())
      .post('/api/users')
      .send({ ...body, name: '  Sam Agent  ', email: ' Sam@Example.COM ' })

    expect(create.mock.calls[0][0].data).toMatchObject({
      name: 'Sam Agent',
      email: 'sam@example.com',
    })
  })

  it.each([
    ['name', { name: 'Al' }],
    ['name', { name: '   Al   ' }],
    ['email', { email: 'not-an-email' }],
    ['password', { password: 'short12' }],
    ['password', { password: 'x'.repeat(129) }],
  ])('returns 400 for an invalid %s: %j', async (field, override) => {
    mockSession(fakeSession(Role.admin))

    const res = await request(createApp())
      .post('/api/users')
      .send({ ...body, ...override })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid input')
    expect(Object.keys(res.body.fields)).toEqual([field])
    expect(create).not.toHaveBeenCalled()
  })

  it('returns 400 when the body is missing', async () => {
    mockSession(fakeSession(Role.admin))

    const res = await request(createApp()).post('/api/users')

    expect(res.status).toBe(400)
    expect(create).not.toHaveBeenCalled()
  })

  it('returns 409 when the email is already taken', async () => {
    mockSession(fakeSession(Role.admin))
    findUnique.mockResolvedValue({ id: 'existing-id' })

    const res = await request(createApp())
      .post('/api/users')
      .send({ ...body, email: 'SAM@example.com' })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'A user with this email already exists' })
    expect(findUnique).toHaveBeenCalledWith({
      where: { email: body.email },
      select: { id: true },
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('returns a generic 500 when the database fails', async () => {
    mockSession(fakeSession(Role.admin))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    create.mockRejectedValue(new Error('connection lost'))

    const res = await request(createApp()).post('/api/users').send(body)

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal server error' })
  })
})

describe('PATCH /api/users/:id', () => {
  const body = { name: 'Sam Agent', email: 'sam@example.com' }
  const createdAt = new Date('2026-10-01T12:00:00Z')
  const target = { id: 'u2', accounts: [{ id: 'acc-1' }] }

  // The first lookup is by id (does the user exist?), the second by email (is it taken?)
  type Found = { id: string; accounts?: { id: string }[] } | null
  function lookups({ user = target as Found, emailOwner = null as Found } = {}) {
    findUnique.mockImplementation(({ where }: { where: { id?: string; email?: string } }) =>
      Promise.resolve(where.id !== undefined ? user : emailOwner),
    )
  }

  beforeEach(() => {
    findUnique.mockReset()
    lookups()
    update.mockReset()
    update.mockResolvedValue({
      id: 'u2',
      name: body.name,
      email: body.email,
      role: Role.agent,
      createdAt,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 401 without a session', async () => {
    mockSession(null)

    const res = await request(createApp()).patch('/api/users/u2').send(body)

    expect(res.status).toBe(401)
    expect(update).not.toHaveBeenCalled()
  })

  it('returns 403 for an agent', async () => {
    mockSession(fakeSession(Role.agent))

    const res = await request(createApp()).patch('/api/users/u2').send(body)

    expect(res.status).toBe(403)
    expect(update).not.toHaveBeenCalled()
  })

  it('updates the name and email and returns only safe fields', async () => {
    mockSession(fakeSession(Role.admin))

    const res = await request(createApp()).patch('/api/users/u2').send(body)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      user: {
        id: 'u2',
        name: body.name,
        email: body.email,
        role: 'agent',
        createdAt: createdAt.toISOString(),
      },
    })
    expect(update).toHaveBeenCalledWith({
      where: { id: 'u2' },
      data: { name: body.name, email: body.email },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    })
  })

  it('leaves the password and sessions alone when no password is sent', async () => {
    mockSession(fakeSession(Role.admin))

    await request(createApp()).patch('/api/users/u2').send(body)

    const { data } = update.mock.calls[0][0]
    expect(data).not.toHaveProperty('accounts')
    expect(data).not.toHaveProperty('sessions')
    expect(data).not.toHaveProperty('password')
  })

  it('hashes a new password and signs the user out of other sessions', async () => {
    mockSession(fakeSession(Role.admin))

    const res = await request(createApp())
      .patch('/api/users/u2')
      .send({ ...body, password: 'new-password' })

    expect(res.status).toBe(200)
    const { data } = update.mock.calls[0][0]
    const { where, data: accountData } = data.accounts.updateMany
    expect(where).toEqual({ providerId: 'credential' })
    expect(accountData.password).not.toBe('new-password')
    const ctx = await auth.$context
    await expect(
      ctx.password.verify({ hash: accountData.password, password: 'new-password' }),
    ).resolves.toBe(true)
    // fakeSession's session id is 's1': the admin's own session survives
    expect(data.sessions).toEqual({ deleteMany: { id: { not: 's1' } } })
  })

  it('creates a credential account when the user has none', async () => {
    mockSession(fakeSession(Role.admin))
    lookups({ user: { id: 'u2', accounts: [] } })

    const res = await request(createApp())
      .patch('/api/users/u2')
      .send({ ...body, password: 'new-password' })

    expect(res.status).toBe(200)
    const account = update.mock.calls[0][0].data.accounts.create
    expect(account).toMatchObject({ accountId: 'u2', providerId: 'credential' })
    const ctx = await auth.$context
    await expect(
      ctx.password.verify({ hash: account.password, password: 'new-password' }),
    ).resolves.toBe(true)
  })

  it('ignores a role sent by the client', async () => {
    mockSession(fakeSession(Role.admin))

    await request(createApp())
      .patch('/api/users/u2')
      .send({ ...body, role: Role.admin })

    expect(update.mock.calls[0][0].data).not.toHaveProperty('role')
  })

  it('trims the name and normalises the email', async () => {
    mockSession(fakeSession(Role.admin))

    await request(createApp())
      .patch('/api/users/u2')
      .send({ name: '  Sam Agent  ', email: ' Sam@Example.COM ' })

    expect(update.mock.calls[0][0].data).toEqual({ name: 'Sam Agent', email: 'sam@example.com' })
  })

  it.each([
    ['name', { name: 'Al' }],
    ['email', { email: 'not-an-email' }],
    ['password', { password: 'short12' }],
    ['password', { password: '' }],
    ['password', { password: 'x'.repeat(129) }],
  ])('returns 400 for an invalid %s: %j', async (field, override) => {
    mockSession(fakeSession(Role.admin))

    const res = await request(createApp())
      .patch('/api/users/u2')
      .send({ ...body, ...override })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid input')
    expect(Object.keys(res.body.fields)).toEqual([field])
    expect(update).not.toHaveBeenCalled()
  })

  it('returns 404 for an unknown user', async () => {
    mockSession(fakeSession(Role.admin))
    lookups({ user: null })

    const res = await request(createApp()).patch('/api/users/missing').send(body)

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'User not found' })
    expect(update).not.toHaveBeenCalled()
  })

  it('returns 409 when another user has the email', async () => {
    mockSession(fakeSession(Role.admin))
    lookups({ emailOwner: { id: 'someone-else' } })

    const res = await request(createApp())
      .patch('/api/users/u2')
      .send({ ...body, email: 'SAM@example.com' })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'A user with this email already exists' })
    expect(findUnique).toHaveBeenCalledWith({ where: { email: body.email }, select: { id: true } })
    expect(update).not.toHaveBeenCalled()
  })

  it('allows keeping the same email', async () => {
    mockSession(fakeSession(Role.admin))
    lookups({ emailOwner: { id: 'u2' } })

    const res = await request(createApp()).patch('/api/users/u2').send(body)

    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalled()
  })
})

describe('GET /api/users', () => {
  beforeEach(() => {
    findMany.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 401 without a session', async () => {
    mockSession(null)

    const res = await request(createApp()).get('/api/users')

    expect(res.status).toBe(401)
    expect(findMany).not.toHaveBeenCalled()
  })

  it('returns 403 for an agent', async () => {
    mockSession(fakeSession(Role.agent))

    const res = await request(createApp()).get('/api/users')

    expect(res.status).toBe(403)
    expect(findMany).not.toHaveBeenCalled()
  })

  it('lists users for an admin', async () => {
    mockSession(fakeSession(Role.admin))
    const createdAt = new Date('2026-10-01T12:00:00Z')
    findMany.mockResolvedValue([
      { id: 'u1', name: 'Ada Admin', email: 'ada@example.com', role: Role.admin, createdAt },
    ])

    const res = await request(createApp()).get('/api/users')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      users: [
        {
          id: 'u1',
          name: 'Ada Admin',
          email: 'ada@example.com',
          role: 'admin',
          createdAt: createdAt.toISOString(),
        },
      ],
    })
    expect(findMany).toHaveBeenCalledWith({
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
  })
})
