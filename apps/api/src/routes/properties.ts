import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

export const propertiesRoutes: FastifyPluginAsync = async (fastify) => {
  // Helper para extrair tenant do JWT
  const getTenant = (request: any) =>
    (request.user as { tenant_id: string }).tenant_id

  // GET /properties — lista todas do tenant
  fastify.get('/', async (request) => {
    const { data, error } = await fastify.supabase
      .from('properties')
      .select('*')
      .eq('tenant_id', getTenant(request))
      .order('name')

    if (error) throw error
    return data
  })

  // GET /properties/proprias — apenas fazendas próprias (tipo = 'propria')
  fastify.get('/proprias', async (request) => {
    const { data, error } = await fastify.supabase
      .from('properties')
      .select('*')
      .eq('tenant_id', getTenant(request))
      .eq('tipo', 'propria')
      .order('name')

    if (error) throw error
    return data
  })

  // GET /properties/clientes — apenas fazendas de clientes (tipo = 'cliente')
  fastify.get('/clientes', async (request) => {
    const { data, error } = await fastify.supabase
      .from('properties')
      .select('*')
      .eq('tenant_id', getTenant(request))
      .eq('tipo', 'cliente')
      .order('name')

    if (error) throw error
    return data
  })

  // GET /properties/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { data, error } = await fastify.supabase
      .from('properties')
      .select('*')
      .eq('id', request.params.id)
      .eq('tenant_id', getTenant(request))
      .single()

    if (error || !data) return reply.notFound('Propriedade não encontrada')
    return data
  })
}
