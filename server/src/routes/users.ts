import { Router } from 'express'
import { requireAdmin, requireAuth } from '../auth/middleware.js'
import { prisma } from '../db.js'

export const usersRouter = Router()

// Every /api/users route is admin-only
usersRouter.use(requireAuth, requireAdmin)

usersRouter.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  res.json({ users })
})
