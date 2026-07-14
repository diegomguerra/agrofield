import { supabase } from './supabase'

type Resp<T> = { data: T }
const wrap = <T,>(data: T): Resp<T> => ({ data })

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: async (email: string, password: string) => {
    const { data: auth, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !auth.user) throw new Error(error?.message ?? 'Credenciais inválidas')

    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, nome, perfil, tenant_id')
      .eq('id', auth.user.id)
      .single()
    if (userErr || !user) throw new Error('Usuário não encontrado')

    return wrap({
      token: auth.session?.access_token ?? '',
      user: {
        id: user.id,
        name: user.nome as string,
        role: user.perfil as string,
        tenant_id: user.tenant_id as string,
      },
    })
  },
}

// ─── Properties ──────────────────────────────────────────────────────────────
const PROPERTY_COLS = 'id, name:nome, tipo, city:cidade, area_hectares, tenant_id'

export const propertiesApi = {
  list: async () => {
    const { data, error } = await supabase
      .from('properties')
      .select(PROPERTY_COLS)
      .order('nome')
    if (error) throw error
    return wrap((data ?? []) as Property[])
  },
  listProprias: async () => {
    const { data, error } = await supabase
      .from('properties')
      .select(PROPERTY_COLS)
      .eq('tipo', 'propria')
      .order('nome')
    if (error) throw error
    return wrap((data ?? []) as Property[])
  },
  listClientes: async () => {
    const { data, error } = await supabase
      .from('properties')
      .select(PROPERTY_COLS)
      .eq('tipo', 'cliente')
      .order('nome')
    if (error) throw error
    return wrap((data ?? []) as Property[])
  },
  get: async (id: string) => {
    const { data, error } = await supabase
      .from('properties')
      .select(PROPERTY_COLS)
      .eq('id', id)
      .single()
    if (error) throw error
    return wrap(data as Property)
  },
}

// ─── Visits ──────────────────────────────────────────────────────────────────
const VISIT_LIST_SELECT = `
  *,
  property:properties(id, name:nome, tipo, city:cidade)
`

const VISIT_DETAIL_SELECT = `
  *,
  property:properties(id, name:nome, tipo, city:cidade),
  visit_services(*, service_type:service_types(name:nome, tipo_custo)),
  visit_sales(*, product:products(name:nome, unit:unidade)),
  work_hours(*)
`

export const visitsApi = {
  list: async (params?: { property_id?: string; date_from?: string; date_to?: string }) => {
    let q = supabase
      .from('visits')
      .select(VISIT_LIST_SELECT)
      .order('date', { ascending: false })
    if (params?.property_id) q = q.eq('property_id', params.property_id)
    if (params?.date_from) q = q.gte('date', params.date_from)
    if (params?.date_to) q = q.lte('date', params.date_to)
    const { data, error } = await q
    if (error) throw error
    return wrap((data ?? []) as Visit[])
  },
  get: async (id: string) => {
    const { data, error } = await supabase
      .from('visits')
      .select(VISIT_DETAIL_SELECT)
      .eq('id', id)
      .single()
    if (error) throw error
    return wrap(data as Visit)
  },
  create: async (payload: CreateVisitPayload) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Não autenticado')

    const { data: me } = await supabase
      .from('users').select('tenant_id').eq('id', user.id).single()
    if (!me) throw new Error('Usuário sem tenant')

    const { data: property } = await supabase
      .from('properties').select('id, tipo').eq('id', payload.property_id).single()
    if (!property) throw new Error('Propriedade não encontrada')

    const { data: visit, error: visitErr } = await supabase
      .from('visits')
      .insert({
        tenant_id: me.tenant_id,
        property_id: payload.property_id,
        collaborator_id: payload.collaborator_id,
        vehicle_id: payload.vehicle_id,
        date: payload.date,
        km_start: payload.km_start,
        km_end: payload.km_end,
        observations: payload.observations,
      })
      .select()
      .single()
    if (visitErr || !visit) throw visitErr

    if (property.tipo === 'propria') {
      if (payload.work_hours) {
        await supabase.from('work_hours').insert({
          visit_id: visit.id,
          collaborator_id: payload.collaborator_id,
          tenant_id: me.tenant_id,
          hours: payload.work_hours,
          date: payload.date,
        })
      }
      if (payload.inputs_used?.length) {
        await supabase.from('property_inputs').insert(
          payload.inputs_used.map((i) => ({
            tenant_id: me.tenant_id,
            property_id: payload.property_id,
            visit_id: visit.id,
            product_id: i.product_id,
            quantity: i.quantity,
            unit: i.unit,
            date: payload.date,
          }))
        )
      }
    } else {
      if (payload.services?.length) {
        await supabase.from('visit_services').insert(
          payload.services.map((s) => ({
            visit_id: visit.id,
            tenant_id: me.tenant_id,
            service_type_id: s.service_type_id,
            quantity: s.quantity,
            unit_price: s.unit_price,
            observations: s.observations,
          }))
        )
      }
      if (payload.sales?.length) {
        await supabase.from('visit_sales').insert(
          payload.sales.map((s) => ({
            visit_id: visit.id,
            tenant_id: me.tenant_id,
            product_id: s.product_id,
            quantity: s.quantity,
            unit_price: s.unit_price,
          }))
        )
      }
    }

    return wrap(visit as Visit)
  },
}

// ─── Daily Logs ──────────────────────────────────────────────────────────────
export const dailyLogsApi = {
  list: async (params?: { month?: string; collaborator_id?: string }) => {
    let q = supabase.from('daily_logs').select('*').order('date', { ascending: false })
    if (params?.collaborator_id) q = q.eq('collaborator_id', params.collaborator_id)
    if (params?.month) {
      q = q.gte('date', `${params.month}-01`).lte('date', `${params.month}-31`)
    }
    const { data, error } = await q
    if (error) throw error
    return wrap((data ?? []) as DailyLog[])
  },
  create: async (payload: Partial<DailyLog>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Não autenticado')
    const { data: me } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
    if (!me) throw new Error('Usuário sem tenant')
    const { data, error } = await supabase
      .from('daily_logs')
      .insert({ ...payload, tenant_id: me.tenant_id })
      .select()
      .single()
    if (error) throw error
    return wrap(data as DailyLog)
  },
}

// ─── Journeys ─────────────────────────────────────────────────────────────────
export const journeysApi = {
  list: async (params?: { month?: string; collaborator_id?: string }) => {
    let q = supabase
      .from('journeys')
      .select(`
        *,
        collaborator:users!collaborator_id(id, name:nome),
        origin_property:properties!origin_property_id(id, name:nome, tipo, city:cidade)
      `)
      .order('started_at', { ascending: false })
    if (params?.collaborator_id) q = q.eq('collaborator_id', params.collaborator_id)
    if (params?.month) {
      q = q.gte('date', `${params.month}-01`).lte('date', `${params.month}-31`)
    }
    const { data, error } = await q
    if (error) throw error
    return wrap((data ?? []) as Journey[])
  },
  get: async (id: string) => {
    const { data, error } = await supabase
      .from('journeys')
      .select(`
        *,
        collaborator:users!collaborator_id(id, name:nome),
        origin_property:properties!origin_property_id(id, name:nome, tipo, city:cidade),
        segments:journey_segments(*, property:properties(id, name:nome, tipo, city:cidade))
      `)
      .eq('id', id)
      .single()
    if (error) throw error
    return wrap(data as JourneyDetail)
  },
}

// ─── Dashboard KPIs ──────────────────────────────────────────────────────────
export interface DashboardKpi {
  tenant_id: string
  mes: string
  total_jornadas: number
  vendedores_ativos: number
  total_km: number
  total_horas_viagem: number
  total_horas_parada: number
  media_km_jornada: number
  dias_com_atividade: number
  custo_combustivel_estimado: number
}

export const dashboardApi = {
  kpis: async (mes?: string) => {
    let q = supabase.from('vw_dashboard_kpis').select('*')
    if (mes) q = q.eq('mes', mes)
    const { data, error } = await q
    if (error) throw error
    return wrap((data ?? []) as DashboardKpi[])
  },
  kpisAllTime: async () => {
    const { data, error } = await supabase.from('vw_dashboard_kpis').select('*')
    if (error) throw error
    return wrap((data ?? []) as DashboardKpi[])
  },
}

// ─── Vendedores ───────────────────────────────────────────────────────────────
export interface VendedorStats {
  tenant_id: string
  collaborator_id: string
  vendedor: string
  perfil?: string
  total_jornadas: number
  total_km: number
  horas_viagem: number
  media_km_jornada: number
  dias_ativos: number
  primeira_jornada?: string
  ultima_jornada?: string
  custo_combustivel: number
  veiculo_principal?: string
  objetivo_principal?: string
}

export interface VendedorMensal {
  tenant_id: string
  collaborator_id: string
  vendedor: string
  mes: string
  jornadas: number
  km: number
  horas: number
  dias_ativos: number
}

export const vendedoresApi = {
  stats: async () => {
    const { data, error } = await supabase.from('vw_vendedor_stats').select('*')
    if (error) throw error
    return wrap((data ?? []) as VendedorStats[])
  },
  mensal: async (mes?: string) => {
    let q = supabase.from('vw_vendedor_mensal').select('*')
    if (mes) q = q.eq('mes', mes)
    const { data, error } = await q
    if (error) throw error
    return wrap((data ?? []) as VendedorMensal[])
  },
}

// ─── Jornadas View ────────────────────────────────────────────────────────────
export interface JornadaCompleta {
  id: string
  tenant_id: string
  date: string
  started_at?: string
  ended_at?: string
  collaborator_id: string
  vendedor: string
  total_distance_km: number
  total_travel_minutes: number
  total_stay_minutes: number
  km_odometer_start?: number
  km_odometer_end?: number
  fuel_price_per_liter?: number
  vehicle_type?: string
  fuel_type?: string
  objective?: string
  origin_name?: string
  origin_city?: string
  client_name?: string
  observations?: string
  total_segmentos?: number
}

export const jornadasApi = {
  list: async (params?: { collaborator_id?: string; mes?: string }) => {
    let q = supabase
      .from('vw_jornadas_completas')
      .select('*')
      .order('date', { ascending: false })
    if (params?.collaborator_id) q = q.eq('collaborator_id', params.collaborator_id)
    if (params?.mes) {
      q = q.gte('date', `${params.mes}-01`).lte('date', `${params.mes}-31`)
    }
    const { data, error } = await q
    if (error) throw error
    return wrap((data ?? []) as JornadaCompleta[])
  },
}

// ─── Tenant Users ─────────────────────────────────────────────────────────────
export interface TenantUser {
  id: string
  nome: string
  perfil?: string
  tenant_id: string
}

export const tenantUsersApi = {
  list: async () => {
    const { data, error } = await supabase
      .from('users')
      .select('id, nome, perfil, tenant_id')
      .order('nome')
    if (error) throw error
    return wrap((data ?? []) as TenantUser[])
  },
}

// ─── Reports ─────────────────────────────────────────────────────────────────
// The views use Portuguese column names; we alias them to match the dashboard's
// existing TypeScript shape (total_km, property_name, tipo). vw_visitas_por_fazenda
// does NOT have a 'mes' column — the `month` filter is ignored there (all-time totals).
export const reportsApi = {
  kmMensal: async (month?: string) => {
    let q = supabase
      .from('vw_km_mensal')
      .select('mes, tenant_id, total_km:km_total, total_visitas, total_dias')
      .order('mes', { ascending: false })
    if (month) q = q.eq('mes', month)
    const { data, error } = await q
    if (error) throw error
    return wrap((data ?? []) as KmMensalRow[])
  },
  kmPorTipoCusto: async (month?: string) => {
    let q = supabase
      .from('vw_km_por_tipo_custo')
      .select('mes, tenant_id, tipo_custo, total_km:km_estimado, total_visitas')
    if (month) q = q.eq('mes', month)
    const { data, error } = await q
    if (error) throw error
    return wrap((data ?? []) as KmTipoCustoRow[])
  },
  custoFazendasProprias: async (month?: string) => {
    let q = supabase
      .from('vw_custo_fazendas_proprias')
      .select('mes, tenant_id, property_id, property_name:fazenda, total_horas:total_minutos, total_visitas')
    if (month) q = q.eq('mes', month)
    const { data, error } = await q
    if (error) throw error
    return wrap((data ?? []) as CustoFazendaRow[])
  },
  visitasPorFazenda: async (_month?: string) => {
    const { data, error } = await supabase
      .from('vw_visitas_por_fazenda')
      .select('property_id, property_name:fazenda, tipo:tipo_fazenda, total_visitas')
    if (error) throw error
    const rows = (data ?? []).map((r: any) => ({ mes: '', ...r })) as VisitasFazendaRow[]
    return wrap(rows)
  },
  diario: async (date: string) => {
    const { data, error } = await supabase
      .from('vw_relatorio_diario')
      .select('date:data, collaborator_name:colaborador, km_rodados:km_total, status, total_visitas, valor_vendas')
      .eq('data', date)
    if (error) throw error
    return wrap((data ?? []) as RelDiarioRow[])
  },
}

// ─── Tipos ───────────────────────────────────────────────────────────────────
export interface Property {
  id: string
  name: string
  tipo: 'propria' | 'cliente'
  city?: string
  area_hectares?: number
  tenant_id: string
}

export interface Visit {
  id: string
  date: string
  property_id: string
  property?: Property
  collaborator_id: string
  km_start?: number
  km_end?: number
  observations?: string
  visit_services?: VisitService[]
  visit_sales?: VisitSale[]
}

export interface VisitService {
  id: string
  service_type_id: string
  quantity?: number
  unit_price?: number
  observations?: string
  service_type?: { name: string; tipo_custo: string }
}

export interface VisitSale {
  id: string
  product_id: string
  quantity: number
  unit_price: number
  product?: { name: string; unit: string }
}

export interface DailyLog {
  id: string
  date: string
  collaborator_id: string
  vehicle_id?: string
  km_start?: number
  km_end?: number
  fuel_liters?: number
  fuel_cost?: number
  observations?: string
}

export interface CreateVisitPayload {
  property_id: string
  collaborator_id: string
  vehicle_id?: string
  date: string
  km_start?: number
  km_end?: number
  observations?: string
  work_hours?: number
  inputs_used?: { product_id: string; quantity: number; unit: string }[]
  services?: { service_type_id: string; quantity?: number; unit_price?: number; observations?: string }[]
  sales?: { product_id: string; quantity: number; unit_price: number }[]
}

export interface KmMensalRow {
  mes: string
  tenant_id: string
  total_km: number
  total_visitas: number
  total_dias?: number
}

export interface KmTipoCustoRow {
  mes: string
  tipo_custo: string
  total_km: number
  total_visitas?: number
}

export interface CustoFazendaRow {
  mes: string
  property_id: string
  property_name: string
  total_horas: number
  total_visitas?: number
}

export interface VisitasFazendaRow {
  mes: string
  property_id: string
  property_name: string
  tipo: string
  total_visitas: number
}

export interface RelDiarioRow {
  date: string
  collaborator_name: string
  property_name?: string
  km_rodados: number
}

export interface Journey {
  id: string
  date: string
  started_at: string
  ended_at?: string
  collaborator_id: string
  collaborator?: { id: string; name: string }
  total_distance_km: number
  total_travel_minutes: number
  total_stay_minutes: number
  average_speed_kmh: number
  km_odometer_start?: number
  km_odometer_end?: number
  origin_property_id?: string
  origin_property?: Property
  origin_name?: string
  origin_city?: string
  objective?: string
  client_name?: string
  invoice_number?: string
  invoice_value?: number
  vehicle_type?: string
  vehicle_plate?: string
  fuel_type?: string
  fuel_price_per_liter?: number
  observations?: string
}

export interface JourneySegment {
  id: string
  journey_id: string
  seq: number
  type: 'travel' | 'stay'
  started_at: string
  ended_at?: string
  duration_minutes?: number
  start_latitude?: number
  start_longitude?: number
  end_latitude?: number
  end_longitude?: number
  distance_km?: number
  property_id?: string
  property?: Property
  location_name?: string
  observations?: string
  work_hours?: number
}

export interface JourneyDetail extends Journey {
  segments: JourneySegment[]
}
