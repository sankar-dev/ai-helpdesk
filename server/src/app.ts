import express, { type NextFunction, type Request, type Response } from 'express'
import { toNodeHandler } from 'better-auth/node'
import { auth } from './auth/auth.js'
import { requireAuth } from './auth/middleware.js'
import { healthRouter } from './routes/health.js'
import { usersRouter } from './routes/users.js'

// Builds the Express app without starting it, so tests can use it directly.
export function createApp() {
  const app = express()
  app.disable('x-powered-by')

  // Better Auth parses its own request bodies, so it must be mounted before express.json()
  app.all('/api/auth/{*any}', toNodeHandler(auth))

  app.use(express.json())

  app.use('/api/health', healthRouter)
  app.use('/api/users', usersRouter)

  app.get('/api/me', requireAuth, (req, res) => {
    res.json({ user: req.user })
  })

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  // Last-resort handler: log the error and return JSON without a stack trace
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      return next(err)
    }
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
