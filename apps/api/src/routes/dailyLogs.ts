import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const createLogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  collaborator_id: z.string().uuid(),
  vehicle_id: z.string().uuid().optional(),
  km_start: z.number().optional(),
  km_end: z.number().optional(),
  fuel_liters: z.number().optional(),
  fuel_cost: z.number().optional(),
  observations: z.string().optional(),
})

export const dailyLogsRoutes: FastifyPluginAsync = async (fastify) => {
  const getTenant = (request: any) =>
    (request.user as { tenant_id: string }).tenant_id

  // GET /daily-logs
  fastify.get<{ Querystring: { month?: string; collaborator_id?: string } }>(
    '/',
    async (request) => {
      let query = fastify.supabase
        .from('daily_logs')
        .select(`*, collaborator:users(id, nome), vehicle:vehicles(id, plate, model)`)
        .eq('tenant_id', getTenant(request))
        .order('date', { ascending: false })

      const { month, collaborator_id } = request.query
      if (month) {
        // month = "2024-06"
        query = query.gte('date', `${month}-01`).lte('date', `${month}-31`)
      }
      if (collaborator_id) query = query.eq('collaborator_id', collaborator_id)

      const { data, error } = await query
      if (error) throw error
      return data
    }
  )

  // POST /daily-logs
  fastify.post('/', async (request, reply) => {
    const body = createLogSchema.parse(request.body)
    const tenant_id = getTenant(request)

    const { data, error } = await fastify.supabase
      .from('daily_logs')
      .insert({ ...body, tenant_id })
      .select()
      .single()

    if (error) throw error
    return reply.code(201).send(data)
  })
}
