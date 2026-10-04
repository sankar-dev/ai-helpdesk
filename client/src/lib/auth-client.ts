import { createAuthClient } from 'better-auth/react'
import { inferAdditionalFields } from 'better-auth/client/plugins'

// No baseURL: auth requests go to same-origin /api/auth/*, which the Vite
// proxy forwards in dev and Express serves directly in production.
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields({ user: { role: { type: 'string' } } })],
})

export const { useSession, signIn, signOut } = authClient
