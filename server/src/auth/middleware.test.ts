import express from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { Role } from '../generated/prisma/enums.js'
import { fakeSession, mockSession } from '../test/session.js'
import { requireAdmin, requireAuth } from './middleware.js'

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
