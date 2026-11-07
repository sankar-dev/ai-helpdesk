import { beforeEach, describe, expect, it, vi } from 'vitest'

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }))

vi.mock('../db.js', () => ({
  prisma: { user: { findUnique } },
}))

const { auth, canCreateSession } = await import('./auth.js')

describe('canCreateSession', () => {
  beforeEach(() => {
    findUnique.mockReset()
  })

  it('allows an active user', async () => {
    findUnique.mockResolvedValue({ deletedAt: null })

    await expect(canCreateSession({ userId: 'u1' })).resolves.toBe(true)
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { deletedAt: true },
    })
  })

  it('refuses a soft-deleted user', async () => {
    findUnique.mockResolvedValue({ deletedAt: new Date() })

    await expect(canCreateSession({ userId: 'u1' })).resolves.toBe(false)
  })

  it('refuses a user who does not exist', async () => {
    findUnique.mockResolvedValue(null)

    await expect(canCreateSession({ userId: 'missing' })).resolves.toBe(false)
  })
})

describe('session create hook', () => {
  const before = auth.options.databaseHooks?.session?.create?.before

  beforeEach(() => {
    findUnique.mockReset()
  })

  it('is registered', () => {
    expect(before).toBeTypeOf('function')
  })

  it('stops the session for a deleted user and lets an active one through', async () => {
    const session = { userId: 'u1' } as Parameters<NonNullable<typeof before>>[0]

    findUnique.mockResolvedValue({ deletedAt: new Date() })
    await expect(before!(session)).resolves.toBe(false)

    findUnique.mockResolvedValue({ deletedAt: null })
    await expect(before!(session)).resolves.toBeUndefined()
  })

  it('fails closed when the lookup errors, so no session is created', async () => {
    const session = { userId: 'u1' } as Parameters<NonNullable<typeof before>>[0]
    findUnique.mockRejectedValue(new Error('connection lost'))

    await expect(before!(session)).rejects.toThrow('connection lost')
  })
})
