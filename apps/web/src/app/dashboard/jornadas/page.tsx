'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Loader2, ChevronRight, Route, Clock, MapPin, Fuel } from 'lucide-react'
import Link from 'next/link'

function formatMin(minutes: number) {
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${Math.round(minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}`
}

export default function JornadasPage() {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))

  const { data: journeys, isLoading } = useQuery({
    queryKey: ['journeys', month],
    queryFn: async () => {
      let query = supabase
        .from('journeys')
        .select(`
          *,
          collaborator:users!collaborator_id(id, name:nome),
          origin_property:properties!origin_property_id(id, name:nome, tipo, city:cidade)
        `)
        .order('started_at', { ascending: false })
        .limit(200)

      if (month) {
        query = query
          .gte('date', `${month}-01`)
          .lte('date', `${month}-31`)
      }

      const { data, error } = await query
      if (error) throw error
      return data as any[]
    },
  })

  const totalKm = journeys?.reduce((a, j) => a + (j.total_distance_km ?? 0), 0) ?? 0
  const totalJornadas = journeys?.length ?? 0
  const totalTravelMin = journeys?.reduce((a, j) => a + (j.total_travel_minutes ?? 0), 0) ?? 0

  return (
    <div>
      <PageHeader
        title="Jornadas"
        subtitle={`${totalJornadas} jornada${totalJornadas !== 1 ? 's' : ''} \u00b7 ${totalKm.toFixed(1)} km total \u00b7 ${formatMin(totalTravelMin)} em deslocamento`}
        action={
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{
              padding: '7px 12px', borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: '#fff', fontSize: '0.875rem',
              fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
            }}
          />
        }
      />

      {/* KPI Cards */}
      <div style={{ padding: '0 32px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 0 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--color-primary-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Route size={18} style={{ color: 'var(--color-primary)' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Jornadas</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{totalJornadas}</div>
            </div>
          </div>
        </Card>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MapPin size={18} style={{ color: '#2563eb' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>KM Total</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{totalKm.toFixed(1)} km</div>
            </div>
          </div>
        </Card>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={18} style={{ color: '#d97706' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Tempo em Viagem</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{formatMin(totalTravelMin)}</div>
            </div>
          </div>
        </Card>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#fce7f3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Fuel size={18} style={{ color: '#db2777' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Vel. Media</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                {totalJornadas > 0
                  ? `${(journeys!.reduce((a, j) => a + (j.average_speed_kmh ?? 0), 0) / totalJornadas).toFixed(0)} km/h`
                  : '-'}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Table */}
      <div style={{ padding: '24px 32px' }}>
        <Card padding="0">
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-text-subtle)' }} />
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {['Data', 'Colaborador', 'Objetivo', 'Origem', 'Destino / Cliente', 'Distancia', 'Tempo', 'Veiculo', ''].map((h) => (
                    <th key={h} style={{
                      padding: '12px 14px', textAlign: 'left',
                      fontSize: '0.72rem', fontWeight: 600,
                      color: 'var(--color-text-muted)',
                      letterSpacing: '0.03em', textTransform: 'uppercase',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {journeys?.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: 48, color: 'var(--color-text-subtle)', fontSize: '0.875rem' }}>
                      Nenhuma jornada registrada neste mes.
                    </td>
                  </tr>
                )}
                {journeys?.map((j, i) => {
                  const origin = j.origin_property?.name ?? j.origin_name ?? '-'
                  const destination = j.client_name ?? '-'
                  const odometerKm = j.km_odometer_start != null && j.km_odometer_end != null
                    ? j.km_odometer_end - j.km_odometer_start : null

                  return (
                    <tr
                      key={j.id}
                      style={{
                        borderBottom: i < (journeys.length - 1) ? '1px solid var(--color-border)' : 'none',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 14px', fontSize: '0.85rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        {format(new Date(j.date), 'dd MMM', { locale: ptBR })}
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>
                          {j.started_at ? format(new Date(j.started_at), 'HH:mm') : ''}
                          {j.ended_at ? ` - ${format(new Date(j.ended_at), 'HH:mm')}` : ''}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '0.85rem', fontWeight: 500 }}>
                        {j.collaborator?.name ?? '-'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {j.objective ? (
                          <Badge variant="propria">{j.objective}</Badge>
                        ) : (
                          <span style={{ color: 'var(--color-text-subtle)', fontSize: '0.8rem' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '0.85rem' }}>
                        {origin}
                        {(j.origin_property?.city ?? j.origin_city) && (
                          <span style={{ color: 'var(--color-text-subtle)', marginLeft: 4, fontSize: '0.75rem' }}>
                            {j.origin_property?.city ?? j.origin_city}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '0.85rem' }}>
                        {destination}
                        {j.invoice_number && (
                          <span style={{ color: 'var(--color-text-subtle)', marginLeft: 4, fontSize: '0.75rem' }}>
                            NF {j.invoice_number}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '0.85rem', fontWeight: 600 }}>
                        {j.total_distance_km > 0 ? `${j.total_distance_km.toFixed(1)} km` : '-'}
                        {odometerKm != null && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)', fontWeight: 400 }}>
                            Odom: {odometerKm} km
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                        {formatMin(j.total_travel_minutes)}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                        {j.vehicle_type ?? '-'}
                        {j.vehicle_plate && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)' }}>
                            {j.vehicle_plate}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <Link href={`/dashboard/jornadas/${j.id}`} style={{ color: 'var(--color-text-subtle)', display: 'flex' }}>
                          <ChevronRight size={16} />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  )
}
