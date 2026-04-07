import type { FastifyPluginAsync } from 'fastify'

export const reportsRoutes: FastifyPluginAsync = async (fastify) => {
  const getTenant = (request: any) =>
    (request.user as { tenant_id: string }).tenant_id

  // GET /reports/km-mensal?month=2024-06
  fastify.get<{ Querystring: { month?: string } }>(
    '/km-mensal',
    async (request) => {
      let query = fastify.supabase
        .from('vw_km_mensal')
        .select('*')
        .eq('tenant_id', getTenant(request))
        .order('mes', { ascending: false })

      if (request.query.month) {
        query = query.eq('mes', request.query.month)
      }

      const { data, error } = await query
      if (error) throw error
      return data
    }
  )

  // GET /reports/km-por-tipo-custo?month=2024-06
  fastify.get<{ Querystring: { month?: string } }>(
    '/km-por-tipo-custo',
    async (request) => {
      let query = fastify.supabase
        .from('vw_km_por_tipo_custo')
        .select('*')
        .eq('tenant_id', getTenant(request))

      if (request.query.month) {
        query = query.eq('mes', request.query.month)
      }

      const { data, error } = await query
      if (error) throw error
      return data
    }
  )

  // GET /reports/custo-fazendas-proprias?month=2024-06
  fastify.get<{ Querystring: { month?: string } }>(
    '/custo-fazendas-proprias',
    async (request) => {
      let query = fastify.supabase
        .from('vw_custo_fazendas_proprias')
        .select('*')
        .eq('tenant_id', getTenant(request))

      if (request.query.month) {
        query = query.eq('mes', request.query.month)
      }

      const { data, error } = await query
      if (error) throw error
      return data
    }
  )

  // GET /reports/visitas-por-fazenda?month=2024-06
  fastify.get<{ Querystring: { month?: string } }>(
    '/visitas-por-fazenda',
    async (request) => {
      let query = fastify.supabase
        .from('vw_visitas_por_fazenda')
        .select('*')
        .eq('tenant_id', getTenant(request))

      if (request.query.month) {
        query = query.eq('mes', request.query.month)
      }

      const { data, error } = await query
      if (error) throw error
      return data
    }
  )

  // GET /reports/diario?date=2024-06-15
  fastify.get<{ Querystring: { date: string } }>(
    '/diario',
    async (request, reply) => {
      if (!request.query.date) return reply.badRequest('date é obrigatório')

      const { data, error } = await fastify.supabase
        .from('vw_relatorio_diario')
        .select('*')
        .eq('tenant_id', getTenant(request))
        .eq('date', request.query.date)

      if (error) throw error
      return data
    }
  )
}
