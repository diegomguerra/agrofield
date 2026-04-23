import { getDb, uuid } from '../lib/db'
import { enqueue } from '../lib/sync'
import { useAuthStore } from '../store/auth'

export interface CreateVisitInput {
  property_id: string
  property_tipo: 'propria' | 'cliente'
  date: string
  km_start?: number
  km_end?: number
  latitude?: number
  longitude?: number
  gps_accuracy?: number
  observations?: string
  // Própria
  work_hours?: number
  inputs?: { product_id: string; quantity: number; unit: string }[]
  // Cliente
  services?: { service_type_id: string; quantity?: number; unit_price?: number; observations?: string }[]
  sales?: { product_id: string; quantity: number; unit_price: number }[]
}

/**
 * Cria uma visita localmente e enfileira para sync.
 * Funciona 100% offline.
 */
export async function createVisitOffline(input: CreateVisitInput): Promise<string> {
  const db = getDb()
  const user = useAuthStore.getState().user
  if (!user) throw new Error('Usuário não autenticado')

  const visitId = uuid()
  const now = new Date().toISOString()

  // Insere visita principal
  await db.runAsync(
    `INSERT INTO visits
      (id, property_id, collaborator_id, date, km_start, km_end, latitude, longitude, gps_accuracy, observations, work_hours, tenant_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      visitId,
      input.property_id,
      user.id,
      input.date,
      input.km_start ?? null,
      input.km_end ?? null,
      input.latitude ?? null,
      input.longitude ?? null,
      input.gps_accuracy ?? null,
      input.observations ?? null,
      input.work_hours ?? null,
      user.tenant_id,
      now,
    ]
  )

  // Enfileira visita para sync
  await enqueue('visits', 'INSERT', {
    id: visitId,
    property_id: input.property_id,
    collaborator_id: user.id,
    date: input.date,
    km_start: input.km_start,
    km_end: input.km_end,
    latitude: input.latitude,
    longitude: input.longitude,
    gps_accuracy: input.gps_accuracy,
    observations: input.observations,
    work_hours: input.work_hours,
    tenant_id: user.tenant_id,
  }, uuid())

  // Insumos (fazenda própria)
  for (const inp of input.inputs ?? []) {
    const id = uuid()
    await db.runAsync(
      `INSERT INTO visit_inputs (id, visit_id, product_id, quantity, unit) VALUES (?, ?, ?, ?, ?)`,
      [id, visitId, inp.product_id, inp.quantity, inp.unit]
    )
    await enqueue('property_inputs', 'INSERT', {
      id,
      visit_id: visitId,
      property_id: input.property_id,
      product_id: inp.product_id,
      quantity: inp.quantity,
      unit: inp.unit,
      date: input.date,
      tenant_id: user.tenant_id,
    }, uuid())
  }

  // Serviços (cliente)
  for (const s of input.services ?? []) {
    const id = uuid()
    await db.runAsync(
      `INSERT INTO visit_services (id, visit_id, service_type_id, quantity, unit_price, observations)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, visitId, s.service_type_id, s.quantity ?? null, s.unit_price ?? null, s.observations ?? null]
    )
    await enqueue('visit_services', 'INSERT', {
      id,
      visit_id: visitId,
      service_type_id: s.service_type_id,
      quantity: s.quantity,
      unit_price: s.unit_price,
      observations: s.observations,
      tenant_id: user.tenant_id,
    }, uuid())
  }

  // Vendas (cliente)
  for (const s of input.sales ?? []) {
    const id = uuid()
    await db.runAsync(
      `INSERT INTO visit_sales (id, visit_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?)`,
      [id, visitId, s.product_id, s.quantity, s.unit_price]
    )
    await enqueue('visit_sales', 'INSERT', {
      id,
      visit_id: visitId,
      product_id: s.product_id,
      quantity: s.quantity,
      unit_price: s.unit_price,
      tenant_id: user.tenant_id,
    }, uuid())
  }

  return visitId
}

/**
 * Lista visitas locais (sincronizadas + pendentes)
 */
export async function listVisitsLocal(month: string) {
  const db = getDb()
  return db.getAllAsync<{
    id: string
    property_id: string
    date: string
    km_start: number | null
    km_end: number | null
    observations: string | null
    synced_at: string | null
  }>(
    `SELECT v.*, p.name as property_name, p.tipo as property_tipo
     FROM visits v
     LEFT JOIN properties p ON p.id = v.property_id
     WHERE v.date LIKE ?
     ORDER BY v.date DESC`,
    [`${month}%`]
  )
}
