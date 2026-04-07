import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const syncPayloadSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      table_name: z.string(),
      operation: z.enum(['INSERT', 'UPDATE', 'DELETE']),
      payload: z.record(z.unknown()),
      created_at: z.string(),
    })
  ),
})

/**
 * Endpoint de sincronização para o app React Native offline-first.
 * O app acumula operações na sync_queue local e envia em lote quando conectado.
 */
export const syncRoutes: FastifyPluginAsync = async (fastify) => {
  const getTenant = (request: any) =>
    (request.user as { tenant_id: string }).tenant_id

  // POST /sync — recebe lote de operações do mobile
  fastify.post('/', async (request, reply) => {
    const { items } = syncPayloadSchema.parse(request.body)
    const tenant_id = getTenant(request)

    const results: { id: string; status: 'ok' | 'error'; error?: string }[] = []

    for (const item of items) {
      try {
        // Garante que o tenant_id está no payload
        const data = { ...item.payload, tenant_id }

        if (item.operation === 'INSERT') {
          const { error } = await fastify.supabase
            .from(item.table_name)
            .insert(data)
          if (error) throw error
        } else if (item.operation === 'UPDATE') {
          const { id, ...rest } = data as any
          const { error } = await fastify.supabase
            .from(item.table_name)
            .update(rest)
            .eq('id', id)
            .eq('tenant_id', tenant_id)
          if (error) throw error
        } else if (item.operation === 'DELETE') {
          const { error } = await fastify.supabase
            .from(item.table_name)
            .delete()
            .eq('id', (data as any).id)
            .eq('tenant_id', tenant_id)
          if (error) throw error
        }

        results.push({ id: item.id, status: 'ok' })
      } catch (err: any) {
        results.push({ id: item.id, status: 'error', error: err.message })
      }
    }

    // Marca itens processados na sync_queue como concluídos
    const successIds = results.filter((r) => r.status === 'ok').map((r) => r.id)
    if (successIds.length > 0) {
      await fastify.supabase
        .from('sync_queue')
        .update({ synced_at: new Date().toISOString() })
        .in('id', successIds)
    }

    return reply.send({
      processed: results.length,
      success: successIds.length,
      errors: results.filter((r) => r.status === 'error'),
    })
  })

  // GET /sync/pending — retorna itens ainda não sincronizados (para debug)
  fastify.get('/', async (request) => {
    const { data, error } = await fastify.supabase
      .from('sync_queue')
      .select('*')
      .eq('tenant_id', getTenant(request))
      .is('synced_at', null)
      .order('created_at')
      .limit(100)

    if (error) throw error
    return data
  })
}
