import express from 'express'
import { toNodeHandler } from 'better-auth/node'
import { auth } from './auth/auth.js'
import { requireAuth } from './auth/middleware.js'
import { healthRouter } from './routes/health.js'

// Builds the Express app without starting it, so tests can use it directly.
export function createApp() {
  const app = express()

  // Better Auth parses its own request bodies, so it must be mounted before express.json()
  app.all('/api/auth/{*any}', toNodeHandler(auth))

  app.use(express.json())

  app.use('/api/health', healthRouter)

  app.get('/api/me', requireAuth, (req, res) => {
    res.json({ user: req.user })
  })

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  return app
}
