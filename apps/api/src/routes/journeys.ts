import type { FastifyPluginAsync } from 'fastify'

export const journeysRoutes: FastifyPluginAsync = async (fastify) => {
  const getTenant = (request: any) =>
    (request.user as { tenant_id: string }).tenant_id

  // GET /journeys — lista jornadas com filtro de mes
  fastify.get('/', async (request) => {
    const { month, collaborator_id } = request.query as {
      month?: string
      collaborator_id?: string
    }
    const tenant_id = getTenant(request)

    let query = fastify.supabase
      .from('journeys')
      .select(`
        *,
        collaborator:users!collaborator_id(id, name),
        origin_property:properties!origin_property_id(id, name, tipo, city)
      `)
      .eq('tenant_id', tenant_id)
      .order('started_at', { ascending: false })

    if (month) {
      query = query
        .gte('date', `${month}-01`)
        .lte('date', `${month}-31`)
    }

    if (collaborator_id) {
      query = query.eq('collaborator_id', collaborator_id)
    }

    const { data, error } = await query.limit(200)
    if (error) throw error
    return data
  })

  // GET /journeys/:id — detalhe com segmentos
  fastify.get('/:id', async (request) => {
    const { id } = request.params as { id: string }
    const tenant_id = getTenant(request)

    const { data: journey, error } = await fastify.supabase
      .from('journeys')
      .select(`
        *,
        collaborator:users!collaborator_id(id, name),
        origin_property:properties!origin_property_id(id, name, tipo, city)
      `)
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .single()

    if (error) throw error

    const { data: segments, error: segErr } = await fastify.supabase
      .from('journey_segments')
      .select(`
        *,
        property:properties!property_id(id, name, tipo, city)
      `)
      .eq('journey_id', id)
      .eq('tenant_id', tenant_id)
      .order('seq', { ascending: true })

    if (segErr) throw segErr

    return { ...journey, segments }
  })
}
