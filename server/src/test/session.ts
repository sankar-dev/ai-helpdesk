import { vi } from 'vitest'
import { auth, type Session } from '../auth/auth.js'
import type { Role } from '../generated/prisma/enums.js'

export function fakeSession(role: Role): Session {
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

export function mockSession(session: Session | null) {
  // getSession is overloaded; cast to the simple shape the middleware uses
  vi.spyOn(auth.api, 'getSession').mockResolvedValue(session as never)
}
