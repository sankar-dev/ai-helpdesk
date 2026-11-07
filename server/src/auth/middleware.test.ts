import express from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Role } from '../generated/prisma/enums.js'
import { fakeSession, mockSession } from '../test/session.js'

const { sessionDeleteMany } = vi.hoisted(() => ({ sessionDeleteMany: vi.fn() }))

vi.mock('../db.js', () => ({
  prisma: { session: { deleteMany: sessionDeleteMany } },
}))

const { createApp } = await import('../app.js')
const { requireAdmin, requireAuth } = await import('./middleware.js')

function adminApp() {
  const app = express()
  app.get('/admin', requireAuth, requireAdmin, (_req, res) => {
    res.json({ ok: true })
  })
  return app
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('requireAuth', () => {
  it('returns 401 without a session', async () => {
    mockSession(null)

    const res = await request(createApp()).get('/api/me')

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('returns the user with a session', async () => {
    mockSession(fakeSession(Role.agent))

    const res = await request(createApp()).get('/api/me')

    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ id: 'u1', role: 'agent' })
    expect(sessionDeleteMany).not.toHaveBeenCalled()
  })

  it('returns 401 and revokes the sessions of a soft-deleted user', async () => {
    sessionDeleteMany.mockReset()
    sessionDeleteMany.mockResolvedValue({ count: 1 })
    const session = fakeSession(Role.agent)
    session.user.deletedAt = new Date()
    mockSession(session)

    const res = await request(createApp()).get('/api/me')

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
  })
})

describe('requireAdmin', () => {
  it('returns 401 without a session', async () => {
    mockSession(null)

    const res = await request(adminApp()).get('/admin')

    expect(res.status).toBe(401)
  })

  it('returns 403 for an agent', async () => {
    mockSession(fakeSession(Role.agent))

    const res = await request(adminApp()).get('/admin')

    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Forbidden' })
  })

  it('allows an admin', async () => {
    mockSession(fakeSession(Role.admin))

    const res = await request(adminApp()).get('/admin')

    expect(res.status).toBe(200)
  })
})
