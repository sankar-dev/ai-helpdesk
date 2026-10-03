import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }))

vi.mock('../db.js', () => ({
  prisma: { $queryRaw: queryRaw },
}))

const { createApp } = await import('../app.js')

describe('GET /api/health', () => {
  beforeEach(() => {
    queryRaw.mockReset()
  })

  it('returns ok when the database responds', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }])

    const res = await request(createApp()).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', database: 'connected' })
  })

  it('returns 503 when the database is unreachable', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'))

    const res = await request(createApp()).get('/api/health')

    expect(res.status).toBe(503)
    expect(res.body).toEqual({ status: 'error', database: 'disconnected' })
  })
})

describe('unknown API routes', () => {
  it('return 404 JSON', async () => {
    const res = await request(createApp()).get('/api/nope')

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not found' })
  })
})
