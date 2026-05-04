import Fastify from 'fastify'
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

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
})

// Plugins
await app.register(cors, {
  origin: process.env.CORS_ORIGIN ?? '*',
  credentials: true,
})

await app.register(jwt, {
  secret: process.env.JWT_SECRET!,
})

await app.register(sensible)
await app.register(supabase)

// Auth middleware global (exceto rotas públicas)
app.addHook('onRequest', authMiddleware)

// Rotas
await app.register(authRoutes, { prefix: '/auth' })
await app.register(propertiesRoutes, { prefix: '/properties' })
await app.register(visitsRoutes, { prefix: '/visits' })
await app.register(dailyLogsRoutes, { prefix: '/daily-logs' })
await app.register(reportsRoutes, { prefix: '/reports' })
await app.register(syncRoutes, { prefix: '/sync' })
await app.register(journeysRoutes, { prefix: '/journeys' })

// Health check
app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

const port = Number(process.env.PORT ?? 3001)
const host = process.env.HOST ?? '0.0.0.0'

try {
  await app.listen({ port, host })
  app.log.info(`AgroField API rodando em http://${host}:${port}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
