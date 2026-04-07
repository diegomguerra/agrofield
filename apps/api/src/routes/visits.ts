import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const createVisitSchema = z.object({
  property_id: z.string().uuid(),
  collaborator_id: z.string().uuid(),
  vehicle_id: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  km_start: z.number().optional(),
  km_end: z.number().optional(),
  observations: z.string().optional(),
  // Para fazendas próprias
  checkpoints: z.array(z.string()).optional(),
  work_hours: z.number().optional(),
  inputs_used: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.number(),
        unit: z.string(),
      })
    )
    .optional(),
  // Para fazendas de clientes
  services: z
    .array(
      z.object({
        service_type_id: z.string().uuid(),
        quantity: z.number().optional(),
        unit_price: z.number().optional(),
        observations: z.string().optional(),
      })
    )
    .optional(),
  sales: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.number(),
        unit_price: z.number(),
      })
    )
    .optional(),
})

export const visitsRoutes: FastifyPluginAsync = async (fastify) => {
  const getTenant = (request: any) =>
    (request.user as { tenant_id: string }).tenant_id

  // GET /visits — com filtros opcionais
  fastify.get<{
    Querystring: { property_id?: string; date_from?: string; date_to?: string }
  }>('/', async (request) => {
    let query = fastify.supabase
      .from('visits')
      .select(
        `
        *,
        property:properties(id, name, tipo),
        visit_services(*),
        visit_sales(*, product:products(name))
      `
      )
      .eq('tenant_id', getTenant(request))
      .order('date', { ascending: false })

    const { property_id, date_from, date_to } = request.query
    if (property_id) query = query.eq('property_id', property_id)
    if (date_from) query = query.gte('date', date_from)
    if (date_to) query = query.lte('date', date_to)

    const { data, error } = await query
    if (error) throw error
    return data
  })

  // POST /visits — cria visita (lida com ambos tipos de propriedade)
  fastify.post('/', async (request, reply) => {
    const body = createVisitSchema.parse(request.body)
    const tenant_id = getTenant(request)

    // Verifica a propriedade e seu tipo
    const { data: property } = await fastify.supabase
      .from('properties')
      .select('id, tipo')
      .eq('id', body.property_id)
      .eq('tenant_id', tenant_id)
      .single()

    if (!property) return reply.notFound('Propriedade não encontrada')

    // Cria a visita principal
    const { data: visit, error: visitError } = await fastify.supabase
      .from('visits')
      .insert({
        tenant_id,
        property_id: body.property_id,
        collaborator_id: body.collaborator_id,
        vehicle_id: body.vehicle_id,
        date: body.date,
        km_start: body.km_start,
        km_end: body.km_end,
        observations: body.observations,
      })
      .select()
      .single()

    if (visitError || !visit) throw visitError

    // Insere dados específicos por tipo
    if (property.tipo === 'propria') {
      // Horas de trabalho
      if (body.work_hours) {
        await fastify.supabase.from('work_hours').insert({
          visit_id: visit.id,
          collaborator_id: body.collaborator_id,
          tenant_id,
          hours: body.work_hours,
          date: body.date,
        })
      }
      // Insumos utilizados
      if (body.inputs_used?.length) {
        await fastify.supabase.from('property_inputs').insert(
          body.inputs_used.map((i) => ({
            tenant_id,
            property_id: body.property_id,
            visit_id: visit.id,
            product_id: i.product_id,
            quantity: i.quantity,
            unit: i.unit,
            date: body.date,
          }))
        )
      }
    } else {
      // Serviços prestados em cliente
      if (body.services?.length) {
        await fastify.supabase.from('visit_services').insert(
          body.services.map((s) => ({
            visit_id: visit.id,
            tenant_id,
            service_type_id: s.service_type_id,
            quantity: s.quantity,
            unit_price: s.unit_price,
            observations: s.observations,
          }))
        )
      }
      // Vendas
      if (body.sales?.length) {
        await fastify.supabase.from('visit_sales').insert(
          body.sales.map((s) => ({
            visit_id: visit.id,
            tenant_id,
            product_id: s.product_id,
            quantity: s.quantity,
            unit_price: s.unit_price,
          }))
        )
      }
    }

    return reply.code(201).send(visit)
  })

  // GET /visits/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { data, error } = await fastify.supabase
      .from('visits')
      .select(
        `
        *,
        property:properties(id, name, tipo, city),
        visit_services(*, service_type:service_types(name, tipo_custo)),
        visit_sales(*, product:products(name, unit)),
        work_hours(*)
      `
      )
      .eq('id', request.params.id)
      .eq('tenant_id', getTenant(request))
      .single()

    if (error || !data) return reply.notFound('Visita não encontrada')
    return data
  })
}
