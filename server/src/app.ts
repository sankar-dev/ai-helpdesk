import express from 'express'
import { healthRouter } from './routes/health.js'

// Builds the Express app without starting it, so tests can use it directly.
export function createApp() {
  const app = express()

  app.use(express.json())

  app.use('/api/health', healthRouter)

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  return app
}
