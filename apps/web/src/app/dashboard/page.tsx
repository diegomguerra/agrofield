'use client'

import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { reportsApi, visitsApi } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard, Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { MapPin, CalendarCheck, Truck, TrendingUp, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/lib/store'

const currentMonth = format(new Date(), 'yyyy-MM')
const currentMonthLabel = format(new Date(), 'MMMM yyyy', { locale: ptBR })

export default function DashboardPage() {
  const { user } = useAuthStore()

  const { data: kmMensal, isLoading: loadingKm } = useQuery({
    queryKey: ['km-mensal', currentMonth],
    queryFn: () => reportsApi.kmMensal(currentMonth).then((r) => r.data[0]),
  })

  const { data: visitasFazenda, isLoading: loadingVisitas } = useQuery({
    queryKey: ['visitas-fazenda', currentMonth],
    queryFn: () => reportsApi.visitasPorFazenda(currentMonth).then((r) => r.data),
  })

  const { data: recentVisits, isLoading: loadingRecent } = useQuery({
    queryKey: ['visits-recent'],
    queryFn: () =>
      visitsApi.list({ date_from: `${currentMonth}-01` }).then((r) => r.data.slice(0, 8)),
  })

  const isLoading = loadingKm || loadingVisitas || loadingRecent

  return (
    <div>
      <PageHeader
        title={`Bom dia, ${user?.name?.split(' ')[0] ?? ''} 👋`}
        subtitle={`Resumo de ${currentMonthLabel}`}
      />

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <StatCard
            label="KM rodados no mês"
            value={isLoading ? '—' : (kmMensal?.total_km?.toLocaleString('pt-BR') ?? '0')}
            sub="Todas as propriedades"
            icon={<Truck size={18} />}
            color="var(--color-primary)"
          />
          <StatCard
            label="Visitas no mês"
            value={isLoading ? '—' : (kmMensal?.total_visitas ?? '0')}
            sub="Fazendas próprias e clientes"
            icon={<CalendarCheck size={18} />}
            color="var(--color-soil)"
          />
          <StatCard
            label="Propriedades ativas"
            value={isLoading ? '—' : (visitasFazenda?.length ?? '0')}
            sub="Com visita este mês"
            icon={<MapPin size={18} />}
            color="#7c3aed"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Visitas por fazenda */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Visitas por propriedade</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)' }}>{currentMonthLabel}</span>
            </div>
            {loadingVisitas ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-text-subtle)' }} />
              </div>
            ) : visitasFazenda?.length === 0 ? (
              <p style={{ color: 'var(--color-text-subtle)', fontSize: '0.85rem', textAlign: 'center', padding: '16px 0' }}>
                Nenhuma visita registrada ainda.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {visitasFazenda?.map((row) => (
                  <div key={row.property_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge variant={row.tipo as 'propria' | 'cliente'}>
                        {row.tipo === 'propria' ? 'Própria' : 'Cliente'}
                      </Badge>
                      <span style={{ fontSize: '0.875rem', color: 'var(--color-text)' }}>
                        {row.property_name}
                      </span>
                    </div>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-primary-dark)' }}>
                      {row.total_visitas}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Visitas recentes */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Últimas visitas</span>
            </div>
            {loadingRecent ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-text-subtle)' }} />
              </div>
            ) : recentVisits?.length === 0 ? (
              <p style={{ color: 'var(--color-text-subtle)', fontSize: '0.85rem', textAlign: 'center', padding: '16px 0' }}>
                Nenhuma visita registrada ainda.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {recentVisits?.map((visit) => (
                  <div key={visit.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    paddingBottom: 10,
                    borderBottom: '1px solid var(--color-border)',
                  }}>
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)' }}>
                        {visit.property?.name ?? '—'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>
                        {format(new Date(visit.date), "dd 'de' MMM", { locale: ptBR })}
                        {visit.km_start && visit.km_end
                          ? ` · ${visit.km_end - visit.km_start} km`
                          : ''}
                      </div>
                    </div>
                    <Badge variant={visit.property?.tipo as 'propria' | 'cliente'}>
                      {visit.property?.tipo === 'propria' ? 'Própria' : 'Cliente'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
