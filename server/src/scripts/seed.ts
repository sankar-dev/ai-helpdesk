// Seeds the database. Run with `npm run db:seed` (prisma db seed). Safe to run more than once.
import { auth } from '../auth/auth.js'
import { prisma } from '../db.js'
import { Role } from '../generated/prisma/enums.js'

// Creates the admin from SEED_ADMIN_* env vars, or promotes the user if they already exist.
// Public signup is disabled, so this goes through Better Auth's internal adapter instead of the signup endpoint.
async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL
  const password = process.env.SEED_ADMIN_PASSWORD
  const name = process.env.SEED_ADMIN_NAME ?? 'Admin'

  if (!email || !password) {
    throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD')
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    await prisma.user.update({ where: { email }, data: { role: Role.admin } })
    console.log(`Admin ${email} already exists (role set to admin)`)
    return
  }

  const ctx = await auth.$context
  const user = await ctx.internalAdapter.createUser(
    { email, name, emailVerified: true, role: Role.admin },
    { method: 'admin' },
  )
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: 'credential',
    accountId: user.id,
    password: await ctx.password.hash(password),
  })
  console.log(`Created admin ${email}`)
}

try {
  await seedAdmin()
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
