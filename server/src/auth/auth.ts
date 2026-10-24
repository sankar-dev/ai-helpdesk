import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { config } from '../config.js'
import { prisma } from '../db.js'
import { Role } from '../generated/prisma/enums.js'

// Sessions live in the database (no secondaryStorage, no cookieCache), so
// every request is checked against the session table and logout is immediate.
export const auth = betterAuth({
  baseURL: config.betterAuthUrl,
  secret: config.betterAuthSecret,
  trustedOrigins: [config.clientUrl],
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true, // users are created by admins (see scripts/seed.ts)
    minPasswordLength: 8,
  },
  user: {
    additionalFields: {
      // input: false stops clients from choosing their own role at signup
      role: { type: [Role.admin, Role.agent], defaultValue: Role.agent, input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // extend expiry at most once a day
  },
  // Set explicitly rather than relying on Better Auth's own production detection.
  // Off in development and e2e tests, so repeated sign-ins aren't blocked.
  rateLimit: {
    enabled: config.nodeEnv === 'production',
  },
  advanced: {
    useSecureCookies: config.nodeEnv === 'production',
  },
})

export type Session = typeof auth.$Infer.Session
