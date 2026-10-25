import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Role } from '../generated/prisma/enums.js'
import { fakeSession, mockSession } from '../test/session.js'

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }))

vi.mock('../db.js', () => ({
  prisma: { user: { findMany } },
}))

const { createApp } = await import('../app.js')

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
