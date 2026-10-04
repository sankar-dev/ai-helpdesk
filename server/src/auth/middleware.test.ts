import express from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { Role } from '../generated/prisma/enums.js'
import { auth, type Session } from './auth.js'
import { requireAdmin, requireAuth } from './middleware.js'

function fakeSession(role: Role): Session {
  const now = new Date()
  return {
    user: {
      id: 'u1',
      name: 'Test User',
      email: 'test@example.com',
      emailVerified: true,
      image: null,
      role,
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: 's1',
      token: 'token',
      userId: 'u1',
      expiresAt: new Date(now.getTime() + 60_000),
      ipAddress: null,
      userAgent: null,
      createdAt: now,
      updatedAt: now,
    },
  }
}

function mockSession(session: Session | null) {
  // getSession is overloaded; cast to the simple shape the middleware uses
  vi.spyOn(auth.api, 'getSession').mockResolvedValue(session as never)
}

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
