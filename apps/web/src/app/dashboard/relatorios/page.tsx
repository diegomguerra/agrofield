'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { dashboardApi, vendedoresApi, jornadasApi, type DashboardKpi } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, StatCard } from '@/components/ui/Card'
import { Loader2, Truck, Route, Clock, Fuel, Download } from 'lucide-react'

const CORES = ['#238821', '#2563eb', '#d97706', '#db2777', '#7c3aed', '#0d9488', '#ca5b21', '#6366f1']

function fmtNum(value: number) {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

function fmtBRL(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function sumKpis(rows: DashboardKpi[]): DashboardKpi {
  return rows.reduce(
    (acc, r) => ({
      ...acc,
      total_jornadas: acc.total_jornadas + (r.total_jornadas ?? 0),
      vendedores_ativos: Math.max(acc.vendedores_ativos, r.vendedores_ativos ?? 0),
      total_km: acc.total_km + (r.total_km ?? 0),
      total_horas_viagem: acc.total_horas_viagem + (r.total_horas_viagem ?? 0),
      total_horas_parada: acc.total_horas_parada + (r.total_horas_parada ?? 0),
      custo_combustivel_estimado: acc.custo_combustivel_estimado + (r.custo_combustivel_estimado ?? 0),
      dias_com_atividade: acc.dias_com_atividade + (r.dias_com_atividade ?? 0),
      media_km_jornada: 0,
    }),
    {
      tenant_id: '', mes: '', total_jornadas: 0, vendedores_ativos: 0,
      total_km: 0, total_horas_viagem: 0, total_horas_parada: 0,
      media_km_jornada: 0, dias_com_atividade: 0, custo_combustivel_estimado: 0,
    }
  )
}

export default function RelatoriosPage() {
  const [periodo, setPeriodo] = useState<'mes' | 'todos'>('mes')
  const currentMonth = format(new Date(), 'yyyy-MM')
  const mes = periodo === 'mes' ? currentMonth : undefined

  const { data: kpisData, isLoading: l1 } = useQuery({
    queryKey: ['report-kpis', mes],
    queryFn: () =>
      mes ? dashboardApi.kpis(mes).then((r) => r.data) : dashboardApi.kpisAllTime().then((r) => r.data),
  })

  const { data: vendedoresStats, isLoading: l2 } = useQuery({
    queryKey: ['report-vendedores'],
    queryFn: () => vendedoresApi.stats().then((r) => r.data),
  })

  const { data: vendedoresMensal, isLoading: l3 } = useQuery({
    queryKey: ['report-vendedores-mensal'],
    queryFn: () => vendedoresApi.mensal().then((r) => r.data),
  })

  const { data: jornadas, isLoading: l4 } = useQuery({
    queryKey: ['report-jornadas', mes],
    queryFn: () => jornadasApi.list(mes ? { mes } : undefined).then((r) => r.data),
  })

  const isLoading = l1 || l2 || l3 || l4

  const kpis = useMemo(() => {
    if (!kpisData || kpisData.length === 0) return null
    if (kpisData.length === 1) return kpisData[0]
    return sumKpis(kpisData)
  }, [kpisData])

  // KM por vendedor (bar chart)
  const kmPorVendedor = useMemo(() => {
    if (!vendedoresStats) return []
    return [...vendedoresStats]
      .filter((v) => v.total_km > 0)
      .sort((a, b) => b.total_km - a.total_km)
      .map((v) => ({
        nome: v.vendedor.split(' ')[0],
        km: Math.round(v.total_km),
        jornadas: v.total_jornadas,
      }))
  }, [vendedoresStats])

  // Jornadas por vendedor (pie chart)
  const jornadasPorVendedor = useMemo(() => {
    if (!vendedoresStats) return []
    return [...vendedoresStats]
      .filter((v) => v.total_jornadas > 0)
      .sort((a, b) => b.total_jornadas - a.total_jornadas)
      .map((v, i) => ({
        name: v.vendedor.split(' ')[0],
        value: v.total_jornadas,
        color: CORES[i % CORES.length],
      }))
  }, [vendedoresStats])

  // Evolução mensal (agrupado)
  const evolucaoMensal = useMemo(() => {
    if (!vendedoresMensal) return []
    const byMonth = new Map<string, { mes: string; label: string; km: number; jornadas: number; horas: number }>()
    vendedoresMensal.forEach((v) => {
      const existing = byMonth.get(v.mes) ?? { mes: v.mes, label: '', km: 0, jornadas: 0, horas: 0 }
      existing.km += v.km ?? 0
      existing.jornadas += v.jornadas ?? 0
      existing.horas += v.horas ?? 0
      existing.label = format(new Date(`${v.mes}-01`), 'MMM/yy', { locale: ptBR })
      byMonth.set(v.mes, existing)
    })
    return [...byMonth.values()].sort((a, b) => a.mes.localeCompare(b.mes))
  }, [vendedoresMensal])

  // Jornadas por objetivo
  const jornadasPorObjetivo = useMemo(() => {
    if (!jornadas) return []
    const map = new Map<string, number>()
    jornadas.forEach((j) => {
      const obj = j.objective || 'Não informado'
      map.set(obj, (map.get(obj) ?? 0) + 1)
    })
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, color: CORES[i % CORES.length] }))
  }, [jornadas])

  // Jornadas por veículo
  const jornadasPorVeiculo = useMemo(() => {
    if (!jornadas) return []
    const map = new Map<string, { jornadas: number; km: number }>()
    jornadas.forEach((j) => {
      const v = j.vehicle_type || 'Não informado'
      const existing = map.get(v) ?? { jornadas: 0, km: 0 }
      existing.jornadas += 1
      existing.km += j.total_distance_km ?? 0
      map.set(v, existing)
    })
    return [...map.entries()]
      .sort((a, b) => b[1].km - a[1].km)
      .map(([tipo, data]) => ({ tipo, ...data }))
  }, [jornadas])

  // CSV export
  function exportCSV() {
    if (!jornadas?.length) return
    const headers = ['Data', 'Vendedor', 'Objetivo', 'Veículo', 'KM', 'Tempo Viagem (min)', 'Tempo Parada (min)', 'Origem', 'Cliente', 'Observações']
    const rows = jornadas.map((j) => [
      j.date,
      j.vendedor,
      j.objective ?? '',
      j.vehicle_type ?? '',
      j.total_distance_km?.toFixed(1) ?? '',
      j.total_travel_minutes?.toFixed(0) ?? '',
      j.total_stay_minutes?.toFixed(0) ?? '',
      j.origin_name ?? '',
      j.client_name ?? '',
      (j.observations ?? '').replace(/[\n\r,]/g, ' '),
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-jornadas-${periodo === 'mes' ? currentMonth : 'completo'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const periodoLabel = periodo === 'mes'
    ? format(new Date(), 'MMMM yyyy', { locale: ptBR })
    : 'Todos os períodos'

  const semDados = !isLoading && (!kpis || kpis.total_jornadas === 0)

  return (
    <div>
      <PageHeader
        title="Relatórios"
        subtitle={periodoLabel}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setPeriodo('mes')}
              style={{
                padding: '7px 14px', borderRadius: 6,
                border: '1px solid var(--color-border)',
                background: periodo === 'mes' ? 'var(--color-primary)' : '#fff',
                color: periodo === 'mes' ? '#fff' : 'var(--color-text)',
                fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Este mês
            </button>
            <button
              onClick={() => setPeriodo('todos')}
              style={{
                padding: '7px 14px', borderRadius: 6,
                border: '1px solid var(--color-border)',
                background: periodo === 'todos' ? 'var(--color-primary)' : '#fff',
                color: periodo === 'todos' ? '#fff' : 'var(--color-text)',
                fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Todos
            </button>
            <button
              onClick={exportCSV}
              disabled={!jornadas?.length}
              style={{
                padding: '7px 14px', borderRadius: 6,
                border: '1px solid var(--color-border)',
                background: '#fff', color: 'var(--color-text-muted)',
                fontSize: '0.8rem', fontWeight: 600, cursor: jornadas?.length ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
                opacity: jornadas?.length ? 1 : 0.5,
              }}
            >
              <Download size={14} />
              CSV
            </button>
          </div>
        }
      />

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--color-text-subtle)' }} />
          </div>
        ) : semDados ? (
          <Card>
            <p style={{ textAlign: 'center', color: 'var(--color-text-subtle)', padding: '24px 0', margin: 0, fontSize: '0.875rem' }}>
              Sem dados {periodo === 'mes' ? 'neste mês' : ''}.{' '}
              {periodo === 'mes' && (
                <button
                  onClick={() => setPeriodo('todos')}
                  style={{ background: 'none', border: 'none', color: 'var(--color-primary-dark)', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem', padding: 0, fontFamily: 'inherit' }}
                >
                  Ver todos os períodos
                </button>
              )}
            </p>
          </Card>
        ) : (
          <>
            {/* KPIs resumo */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              <StatCard label="Total KM" value={fmtNum(kpis?.total_km ?? 0)} sub="Quilômetros percorridos" icon={<Truck size={18} />} color="var(--color-primary)" />
              <StatCard label="Jornadas" value={(kpis?.total_jornadas ?? 0).toString()} sub="Atividades registradas" icon={<Route size={18} />} color="#2563eb" />
              <StatCard label="Horas em Campo" value={`${fmtNum(kpis?.total_horas_viagem ?? 0)}h`} sub="Tempo em deslocamento" icon={<Clock size={18} />} color="#d97706" />
              <StatCard label="Custo Combustível" value={`R$ ${fmtBRL(kpis?.custo_combustivel_estimado ?? 0)}`} sub="Estimativa baseada nos KM" icon={<Fuel size={18} />} color="#db2777" />
            </div>

            {/* Gráficos lado a lado */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* KM por vendedor */}
              <Card>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 20 }}>KM por vendedor</div>
                {kmPorVendedor.length === 0 ? (
                  <p style={{ color: 'var(--color-text-subtle)', fontSize: '0.85rem' }}>Sem dados.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={kmPorVendedor} layout="vertical" margin={{ left: 0, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--color-text-subtle)' }} />
                      <YAxis type="category" dataKey="nome" width={90} tick={{ fontSize: 11, fill: 'var(--color-text)' }} />
                      <Tooltip formatter={(v: number) => [`${v} km`, 'KM']} />
                      <Bar dataKey="km" name="KM" fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>

              {/* Jornadas por vendedor (pizza) */}
              <Card>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 20 }}>Jornadas por vendedor</div>
                {jornadasPorVendedor.length === 0 ? (
                  <p style={{ color: 'var(--color-text-subtle)', fontSize: '0.85rem' }}>Sem dados.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={jornadasPorVendedor}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={75}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {jornadasPorVendedor.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => [`${v} jornada${v !== 1 ? 's' : ''}`, 'Jornadas']} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </div>

            {/* Evolução mensal */}
            {evolucaoMensal.length > 1 && (
              <Card>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 20 }}>Evolução mensal</div>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={evolucaoMensal} margin={{ left: 0, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-text-subtle)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-subtle)' }} />
                    <Tooltip />
                    <Bar dataKey="km" name="KM" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="jornadas" name="Jornadas" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* Jornadas por objetivo + veículo */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Por objetivo */}
              <Card>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 16 }}>Jornadas por objetivo</div>
                {jornadasPorObjetivo.length === 0 ? (
                  <p style={{ color: 'var(--color-text-subtle)', fontSize: '0.85rem' }}>Sem dados.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {jornadasPorObjetivo.map((item, i) => {
                      const maxVal = jornadasPorObjetivo[0]?.value ?? 1
                      return (
                        <div key={i}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                            <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>{item.name}</span>
                            <span style={{ color: 'var(--color-text-muted)' }}>{item.value}</span>
                          </div>
                          <div style={{ height: 6, borderRadius: 3, background: 'var(--color-bg)' }}>
                            <div style={{
                              height: '100%', borderRadius: 3,
                              background: item.color,
                              width: `${(item.value / maxVal) * 100}%`,
                              transition: 'width 0.3s',
                            }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>

              {/* Por veículo */}
              <Card>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 16 }}>Por tipo de veículo</div>
                {jornadasPorVeiculo.length === 0 ? (
                  <p style={{ color: 'var(--color-text-subtle)', fontSize: '0.85rem' }}>Sem dados.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                        {['Veículo', 'Jornadas', 'KM Total'].map((h) => (
                          <th key={h} style={{
                            padding: '8px 12px', textAlign: 'left',
                            fontSize: '0.72rem', fontWeight: 600,
                            color: 'var(--color-text-muted)',
                            textTransform: 'uppercase', letterSpacing: '0.03em',
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {jornadasPorVeiculo.map((row, i) => (
                        <tr key={i} style={{ borderBottom: i < jornadasPorVeiculo.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                          <td style={{ padding: '10px 12px', fontSize: '0.875rem', fontWeight: 500 }}>
                            {row.tipo}
                          </td>
                          <td style={{ padding: '10px 12px', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                            {row.jornadas}
                          </td>
                          <td style={{ padding: '10px 12px', fontSize: '0.875rem', fontWeight: 600 }}>
                            {fmtNum(row.km)} km
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </div>

            {/* Detalhamento de jornadas */}
            <Card padding="0">
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  Detalhamento de jornadas ({jornadas?.length ?? 0})
                </span>
              </div>
              {!jornadas?.length ? (
                <p style={{ textAlign: 'center', color: 'var(--color-text-subtle)', padding: '24px 0', margin: 0, fontSize: '0.875rem' }}>
                  Nenhuma jornada encontrada.
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                        {['Data', 'Vendedor', 'Objetivo', 'KM', 'Tempo Viagem', 'Tempo Parada', 'Cliente'].map((h) => (
                          <th key={h} style={{
                            padding: '10px 16px', textAlign: 'left',
                            fontSize: '0.72rem', fontWeight: 600,
                            color: 'var(--color-text-muted)',
                            textTransform: 'uppercase', letterSpacing: '0.03em',
                            whiteSpace: 'nowrap',
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {jornadas.slice(0, 50).map((j, i) => (
                        <tr
                          key={j.id}
                          style={{ borderBottom: i < Math.min(jornadas.length, 50) - 1 ? '1px solid var(--color-border)' : 'none' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '10px 16px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                            {format(new Date(j.date), 'dd/MM/yyyy')}
                          </td>
                          <td style={{ padding: '10px 16px', fontSize: '0.85rem', fontWeight: 500 }}>
                            {j.vendedor}
                          </td>
                          <td style={{ padding: '10px 16px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                            {j.objective ?? '—'}
                          </td>
                          <td style={{ padding: '10px 16px', fontSize: '0.85rem', fontWeight: 600 }}>
                            {j.total_distance_km > 0 ? `${fmtNum(j.total_distance_km)} km` : '—'}
                          </td>
                          <td style={{ padding: '10px 16px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                            {j.total_travel_minutes > 0 ? `${Math.round(j.total_travel_minutes)} min` : '—'}
                          </td>
                          <td style={{ padding: '10px 16px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                            {j.total_stay_minutes > 0 ? `${Math.round(j.total_stay_minutes)} min` : '—'}
                          </td>
                          <td style={{ padding: '10px 16px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                            {j.client_name ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {jornadas.length > 50 && (
                    <div style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.82rem', color: 'var(--color-text-subtle)', borderTop: '1px solid var(--color-border)' }}>
                      Mostrando 50 de {jornadas.length} jornadas. Exporte o CSV para ver todas.
                    </div>
                  )}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
