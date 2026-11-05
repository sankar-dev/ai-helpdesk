import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { auth } from '../auth/auth.js'
import { requireAdmin, requireAuth } from '../auth/middleware.js'
import { prisma } from '../db.js'

export const usersRouter = Router()

const userSelect = { id: true, name: true, email: true, role: true, createdAt: true } as const

const createUserSchema = z.object({
  name: z.string().trim().min(3),
  // Better Auth looks emails up lower-cased at sign-in, so they must be stored that way
  email: z.string().trim().toLowerCase().pipe(z.email()),
  // Same limits as Better Auth's password policy, which this route doesn't go through
  password: z.string().min(8).max(128),
})

// Every /api/users route is admin-only
usersRouter.use(requireAuth, requireAdmin)

usersRouter.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({
    select: userSelect,
    orderBy: { createdAt: 'asc' },
  })
  res.json({ users })
})

usersRouter.post('/', async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid input',
      fields: z.flattenError(parsed.error).fieldErrors,
    })
    return
  }
  const { name, email, password } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) {
    res.status(409).json({ error: 'A user with this email already exists' })
    return
  }

  const { password: passwordContext } = await auth.$context
  const id = randomUUID()

  // The nested write is atomic, so a failure can't leave a user who has no password.
  // Public sign-up is disabled, so the credential account Better Auth signs in with is created here.
  const user = await prisma.user.create({
    data: {
      id,
      name,
      email,
      emailVerified: true,
      accounts: {
        create: {
          id: randomUUID(),
          accountId: id,
          providerId: 'credential',
          password: await passwordContext.hash(password),
        },
      },
    },
    select: userSelect,
  })
  res.status(201).json({ user })
})
