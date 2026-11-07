import { randomUUID } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { auth } from '../auth/auth.js'
import { requireAdmin, requireAuth } from '../auth/middleware.js'
import { prisma } from '../db.js'

export const usersRouter = Router()

const userSelect = { id: true, name: true, email: true, role: true, createdAt: true } as const

const nameSchema = z.string().trim().min(3)
// Better Auth looks emails up lower-cased at sign-in, so they must be stored that way
const emailSchema = z.string().trim().toLowerCase().pipe(z.email())
// Same limits as Better Auth's password policy, which these routes don't go through
const passwordSchema = z.string().min(8).max(128)

const createUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
})

// Omitting the password leaves it unchanged
const updateUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema.optional(),
})

// Validates the request body. On failure it sends a 400 with the Zod errors keyed by field
// and returns undefined, so the caller just returns.
function parseBody<S extends z.ZodType>(schema: S, req: Request, res: Response) {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: 'Invalid input', fields: z.flattenError(parsed.error).fieldErrors })
    return undefined
  }
  return parsed.data
}

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
  const body = parseBody(createUserSchema, req, res)
  if (!body) return
  const { name, email, password } = body

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

usersRouter.patch('/:id', async (req, res) => {
  const body = parseBody(updateUserSchema, req, res)
  if (!body) return
  const { name, email, password } = body
  const { id } = req.params

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, accounts: { where: { providerId: 'credential' }, select: { id: true } } },
  })
  if (!target) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (existing && existing.id !== id) {
    res.status(409).json({ error: 'A user with this email already exists' })
    return
  }

  let passwordWrites = {}
  if (password) {
    const hash = await (await auth.$context).password.hash(password)
    passwordWrites = {
      // A user without a credential account gets one, so the new password always works
      accounts:
        target.accounts.length > 0
          ? { updateMany: { where: { providerId: 'credential' }, data: { password: hash } } }
          : {
              create: {
                id: randomUUID(),
                accountId: id,
                providerId: 'credential',
                password: hash,
              },
            },
      // Sign the user out everywhere after a reset, but keep the admin's own current session
      sessions: { deleteMany: { id: { not: req.session!.id } } },
    }
  }

  // One update with nested writes, so the profile and password change together or not at all
  const user = await prisma.user.update({
    where: { id },
    data: { name, email, ...passwordWrites },
    select: userSelect,
  })
  res.json({ user })
})
