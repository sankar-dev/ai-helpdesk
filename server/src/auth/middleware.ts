import type { NextFunction, Request, Response } from 'express'
import { fromNodeHeaders } from 'better-auth/node'
import { Role } from '../generated/prisma/enums.js'
import { auth } from './auth.js'

// Loads the session from the database; 401 if there isn't a valid one.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
  if (!session) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  req.user = session.user
  req.session = session.session
  next()
}

// Use after requireAuth.
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== Role.admin) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}
