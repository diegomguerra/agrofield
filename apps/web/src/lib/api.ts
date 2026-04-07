import axios from 'axios'

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  headers: { 'Content-Type': 'application/json' },
})

// Injeta token automaticamente
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('af_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Redireciona para /login em 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('af_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ token: string; user: { id: string; name: string; role: string } }>(
      '/auth/login',
      { email, password }
    ),
}

// ─── Properties ──────────────────────────────────────────────────────────────
export const propertiesApi = {
  list: () => api.get<Property[]>('/properties'),
  listProprias: () => api.get<Property[]>('/properties/proprias'),
  listClientes: () => api.get<Property[]>('/properties/clientes'),
  get: (id: string) => api.get<Property>(`/properties/${id}`),
}

// ─── Visits ──────────────────────────────────────────────────────────────────
export const visitsApi = {
  list: (params?: { property_id?: string; date_from?: string; date_to?: string }) =>
    api.get<Visit[]>('/visits', { params }),
  get: (id: string) => api.get<Visit>(`/visits/${id}`),
  create: (data: CreateVisitPayload) => api.post<Visit>('/visits', data),
}

// ─── Daily Logs ───────────────────────────────────────────────────────────────
export const dailyLogsApi = {
  list: (params?: { month?: string; collaborator_id?: string }) =>
    api.get<DailyLog[]>('/daily-logs', { params }),
  create: (data: Partial<DailyLog>) => api.post<DailyLog>('/daily-logs', data),
}

// ─── Reports ─────────────────────────────────────────────────────────────────
export const reportsApi = {
  kmMensal: (month?: string) =>
    api.get<KmMensalRow[]>('/reports/km-mensal', { params: { month } }),
  kmPorTipoCusto: (month?: string) =>
    api.get<KmTipoCustoRow[]>('/reports/km-por-tipo-custo', { params: { month } }),
  custoFazendasProprias: (month?: string) =>
    api.get<CustoFazendaRow[]>('/reports/custo-fazendas-proprias', { params: { month } }),
  visitasPorFazenda: (month?: string) =>
    api.get<VisitasFazendaRow[]>('/reports/visitas-por-fazenda', { params: { month } }),
  diario: (date: string) =>
    api.get<RelDiarioRow[]>('/reports/diario', { params: { date } }),
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
}

export interface KmTipoCustoRow {
  mes: string
  tipo_custo: string
  total_km: number
}

export interface CustoFazendaRow {
  mes: string
  property_id: string
  property_name: string
  total_horas: number
  total_insumos: number
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
  property_name: string
  km_rodados: number
}
