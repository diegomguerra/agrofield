import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import sensible from '@fastify/sensible'

import { authRoutes } from './routes/auth.js'
import { propertiesRoutes } from './routes/properties.js'
import { visitsRoutes } from './routes/visits.js'
import { dailyLogsRoutes } from './routes/dailyLogs.js'
import { reportsRoutes } from './routes/reports.js'
import { syncRoutes } from './routes/sync.js'
import { journeysRoutes } from './routes/journeys.js'
import { authMiddleware } from './middleware/auth.js'
import { supabase } from './plugins/supabase.js'

let cached: FastifyInstance | null = null
let building: Promise<FastifyInstance> | null = null

export async function buildApp(): Promise<FastifyInstance> {
  if (cached) return cached
  if (building) return building

  building = (async () => {
    const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } })

    await app.register(cors, {
      origin: process.env.CORS_ORIGIN ?? '*',
      credentials: true,
    })
    await app.register(jwt, { secret: process.env.JWT_SECRET! })
    await app.register(sensible)
    await app.register(supabase)

    app.addHook('onRequest', authMiddleware)

    await app.register(authRoutes, { prefix: '/auth' })
    await app.register(propertiesRoutes, { prefix: '/properties' })
    await app.register(visitsRoutes, { prefix: '/visits' })
    await app.register(dailyLogsRoutes, { prefix: '/daily-logs' })
    await app.register(reportsRoutes, { prefix: '/reports' })
    await app.register(syncRoutes, { prefix: '/sync' })
    await app.register(journeysRoutes, { prefix: '/journeys' })

    app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

    cached = app
    return app
  })()

  return building
}
