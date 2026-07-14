'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, differenceInDays, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { dashboardApi, vendedoresApi, tenantUsersApi, type DashboardKpi, type VendedorStats } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard, Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import {
  Truck,
  Route,
  Clock,
  Fuel,
  Loader2,
  TrendingUp,
  AlertCircle,
  Users,
} from 'lucide-react'
import Link from 'next/link'

const currentMonth = format(new Date(), 'yyyy-MM')

function fmtBRL(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtNum(value: number) {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

function statusVendedor(ultimaJornada?: string): 'ativo' | 'alerta' | 'inativo' | 'nunca' {
  if (!ultimaJornada) return 'nunca'
  const dias = differenceInDays(new Date(), parseISO(ultimaJornada))
  if (dias < 7) return 'ativo'
  if (dias < 30) return 'alerta'
  return 'inativo'
}

function StatusBadge({ status }: { status: ReturnType<typeof statusVendedor> }) {
  const map = {
    ativo: { variant: 'success' as const, label: 'Ativo' },
    alerta: { variant: 'warning' as const, label: 'Alerta' },
    inativo: { variant: 'default' as const, label: 'Inativo' },
    nunca: { variant: 'default' as const, label: 'Sem registro' },
  }
  return <Badge variant={map[status].variant}>{map[status].label}</Badge>
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
      tenant_id: '',
      mes: '',
      total_jornadas: 0,
      vendedores_ativos: 0,
      total_km: 0,
      total_horas_viagem: 0,
      total_horas_parada: 0,
      media_km_jornada: 0,
      dias_com_atividade: 0,
      custo_combustivel_estimado: 0,
    }
  )
}

export default function DashboardPage() {
  const [periodo, setPeriodo] = useState<'mes' | 'todos'>('mes')
  const mes = periodo === 'mes' ? currentMonth : undefined

  const { data: kpisData, isLoading: loadingKpis } = useQuery({
    queryKey: ['dashboard-kpis', mes],
    queryFn: () =>
      mes ? dashboardApi.kpis(mes).then((r) => r.data) : dashboardApi.kpisAllTime().then((r) => r.data),
  })

  const { data: vendedoresStats, isLoading: loadingVendedores } = useQuery({
    queryKey: ['vendedores-stats'],
    queryFn: () => vendedoresApi.stats().then((r) => r.data),
  })

  const { data: allUsers, isLoading: loadingUsers } = useQuery({
    queryKey: ['tenant-users'],
    queryFn: () => tenantUsersApi.list().then((r) => r.data),
  })

  const kpis = useMemo(() => {
    if (!kpisData || kpisData.length === 0) return null
    if (kpisData.length === 1) return kpisData[0]
    return sumKpis(kpisData)
  }, [kpisData])

  const mediaKm = useMemo(() => {
    if (!kpis || !kpis.total_jornadas) return 0
    return kpis.total_km / kpis.total_jornadas
  }, [kpis])

  // Monta lista completa de vendedores (todos users do tenant + dados de jornadas se tiver)
  const equipe = useMemo(() => {
    if (!allUsers) return []
    const statsMap = new Map<string, VendedorStats>()
    vendedoresStats?.forEach((s) => statsMap.set(s.collaborator_id, s))

    return allUsers
      .map((u) => {
        const s = statsMap.get(u.id)
        return {
          id: u.id,
          nome: u.nome,
          perfil: u.perfil ?? '',
          total_jornadas: s?.total_jornadas ?? 0,
          total_km: s?.total_km ?? 0,
          ultima_jornada: s?.ultima_jornada,
          status: statusVendedor(s?.ultima_jornada),
        }
      })
      .sort((a, b) => b.total_km - a.total_km)
  }, [allUsers, vendedoresStats])

  // Insights automáticos
  const insights = useMemo(() => {
    const msgs: string[] = []
    if (!kpis || kpis.total_jornadas === 0) {
      msgs.push('Nenhuma jornada registrada. Os vendedores precisam usar o app mobile para registrar suas atividades.')
      return msgs
    }

    const top = vendedoresStats
      ? [...vendedoresStats].sort((a, b) => b.total_km - a.total_km)[0]
      : null

    if (top) {
      msgs.push(
        `${top.vendedor} é o vendedor mais ativo com ${fmtNum(top.total_km)} km em ${top.total_jornadas} jornada${top.total_jornadas !== 1 ? 's' : ''}.`
      )
    }

    const semJornadas = equipe.filter((e) => e.total_jornadas === 0).length
    if (semJornadas > 0) {
      msgs.push(`${semJornadas} vendedor${semJornadas !== 1 ? 'es' : ''} sem nenhuma jornada registrada.`)
    }

    if (mediaKm > 0) {
      msgs.push(`Média de ${fmtNum(mediaKm)} km por jornada.`)
    }

    if (kpis.custo_combustivel_estimado > 0) {
      msgs.push(`Custo estimado de combustível: R$ ${fmtBRL(kpis.custo_combustivel_estimado)}.`)
    }

    return msgs
  }, [kpis, vendedoresStats, equipe, mediaKm])

  const isLoading = loadingKpis || loadingVendedores || loadingUsers
  const periodoLabel = periodo === 'mes'
    ? format(new Date(), 'MMMM yyyy', { locale: ptBR })
    : 'Todos os períodos'

  const semDadosNoMes = periodo === 'mes' && !loadingKpis && (!kpis || kpis.total_jornadas === 0)

  return (
    <div>
      <PageHeader
        title="Painel de Gestão"
        subtitle={periodoLabel}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setPeriodo('mes')}
              style={{
                padding: '7px 14px',
                borderRadius: 6,
                border: '1px solid var(--color-border)',
                background: periodo === 'mes' ? 'var(--color-primary)' : '#fff',
                color: periodo === 'mes' ? '#fff' : 'var(--color-text)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
            >
              Este mês
            </button>
            <button
              onClick={() => setPeriodo('todos')}
              style={{
                padding: '7px 14px',
                borderRadius: 6,
                border: '1px solid var(--color-border)',
                background: periodo === 'todos' ? 'var(--color-primary)' : '#fff',
                color: periodo === 'todos' ? '#fff' : 'var(--color-text)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
            >
              Todos
            </button>
          </div>
        }
      />

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Aviso sem dados no mês */}
        {semDadosNoMes && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderRadius: 8,
            background: '#fef9c3',
            border: '1px solid #fde047',
          }}>
            <AlertCircle size={16} style={{ color: '#a16207', flexShrink: 0 }} />
            <span style={{ fontSize: '0.875rem', color: '#713f12' }}>
              Sem dados neste mês.{' '}
              <button
                onClick={() => setPeriodo('todos')}
                style={{ background: 'none', border: 'none', color: 'var(--color-primary-dark)', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem', padding: 0, fontFamily: 'inherit' }}
              >
                Ver todos os períodos
              </button>
            </span>
          </div>
        )}

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <StatCard
            label="Total KM"
            value={isLoading ? '—' : fmtNum(kpis?.total_km ?? 0)}
            sub="Quilômetros percorridos"
            icon={<Truck size={18} />}
            color="var(--color-primary)"
          />
          <StatCard
            label="Jornadas"
            value={isLoading ? '—' : (kpis?.total_jornadas ?? 0).toString()}
            sub="Atividades registradas"
            icon={<Route size={18} />}
            color="#2563eb"
          />
          <StatCard
            label="Horas em Campo"
            value={isLoading ? '—' : `${fmtNum(kpis?.total_horas_viagem ?? 0)}h`}
            sub="Tempo em deslocamento"
            icon={<Clock size={18} />}
            color="#d97706"
          />
          <StatCard
            label="Custo Combustível"
            value={isLoading ? '—' : `R$ ${fmtBRL(kpis?.custo_combustivel_estimado ?? 0)}`}
            sub="Estimativa baseada nos KM"
            icon={<Fuel size={18} />}
            color="#db2777"
          />
        </div>

        {/* Equipe */}
        <Card padding="0">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--color-border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={16} style={{ color: 'var(--color-text-muted)' }} />
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Equipe</span>
            </div>
            <Link
              href="/dashboard/vendedores"
              style={{ fontSize: '0.8rem', color: 'var(--color-primary-dark)', fontWeight: 500, textDecoration: 'none' }}
            >
              Ver detalhes
            </Link>
          </div>
          {loadingUsers ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-text-subtle)' }} />
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {['Nome', 'Jornadas', 'KM Total', 'Última Atividade', 'Status'].map((h) => (
                    <th key={h} style={{
                      padding: '10px 20px',
                      textAlign: 'left',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: 'var(--color-text-muted)',
                      letterSpacing: '0.03em',
                      textTransform: 'uppercase',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {equipe.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-subtle)', fontSize: '0.875rem' }}>
                      Nenhum vendedor encontrado.
                    </td>
                  </tr>
                )}
                {equipe.map((v, i) => (
                  <tr
                    key={v.id}
                    style={{
                      borderBottom: i < equipe.length - 1 ? '1px solid var(--color-border)' : 'none',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '12px 20px' }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)' }}>
                        {v.nome}
                      </div>
                      {v.perfil && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)', marginTop: 2, textTransform: 'capitalize' }}>
                          {v.perfil}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                      {v.total_jornadas}
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: '0.875rem', fontWeight: 600 }}>
                      {v.total_km > 0 ? `${fmtNum(v.total_km)} km` : '—'}
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                      {v.ultima_jornada
                        ? format(parseISO(v.ultima_jornada), "dd 'de' MMM", { locale: ptBR })
                        : '—'}
                    </td>
                    <td style={{ padding: '12px 20px' }}>
                      <StatusBadge status={v.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Insights */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <TrendingUp size={16} style={{ color: 'var(--color-text-muted)' }} />
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Insights</span>
          </div>
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-text-subtle)' }} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {insights.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '10px 14px',
                    borderRadius: 6,
                    background: 'var(--color-bg)',
                    fontSize: '0.875rem',
                    color: 'var(--color-text)',
                  }}
                >
                  <div style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--color-primary)',
                    marginTop: 7,
                    flexShrink: 0,
                  }} />
                  {msg}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
