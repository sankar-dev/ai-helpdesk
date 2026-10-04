// Creates the first admin from SEED_ADMIN_* env vars, or promotes the user if they already exist.
import { auth } from '../auth/auth.js'
import { prisma } from '../db.js'

const email = process.env.SEED_ADMIN_EMAIL
const password = process.env.SEED_ADMIN_PASSWORD
const name = process.env.SEED_ADMIN_NAME ?? 'Admin'

if (!email || !password) {
  console.error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD')
  process.exit(1)
}

const existing = await prisma.user.findUnique({ where: { email } })
if (!existing) {
  await auth.api.signUpEmail({ body: { email, password, name } })
}
await prisma.user.update({ where: { email }, data: { role: 'admin' } })

console.log(`${existing ? 'Promoted' : 'Created'} admin ${email}`)
await prisma.$disconnect()
