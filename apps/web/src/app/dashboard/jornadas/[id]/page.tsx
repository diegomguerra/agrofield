'use client'

import { useQuery } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Loader2, ArrowLeft, MapPin, Clock, Route, Navigation, User, FileText } from 'lucide-react'

function formatMin(minutes: number) {
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${Math.round(minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}`
}

function InfoRow({ label, value }: { label: string; value: string | number | undefined | null }) {
  if (value == null || value === '') return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

export default function JourneyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const { data: journey, isLoading } = useQuery({
    queryKey: ['journey', id],
    queryFn: async () => {
      const { data: j, error } = await supabase
        .from('journeys')
        .select(`
          *,
          collaborator:users!collaborator_id(id, name:nome),
          origin_property:properties!origin_property_id(id, name:nome, tipo, city:cidade)
        `)
        .eq('id', id)
        .single()
      if (error) throw error

      const { data: segments } = await supabase
        .from('journey_segments')
        .select(`
          *,
          property:properties!property_id(id, name:nome, tipo, city:cidade)
        `)
        .eq('journey_id', id)
        .order('seq', { ascending: true })

      return { ...j, segments: segments ?? [] } as any
    },
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-text-subtle)' }} />
      </div>
    )
  }

  if (!journey) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-subtle)' }}>
        Jornada nao encontrada.
      </div>
    )
  }

  const travelSegs = journey.segments?.filter((s) => s.type === 'travel') ?? []
  const staySegs = journey.segments?.filter((s) => s.type === 'stay') ?? []
  const odometerKm = journey.km_odometer_start != null && journey.km_odometer_end != null
    ? journey.km_odometer_end - journey.km_odometer_start : null

  return (
    <div>
      <PageHeader
        title={`Jornada de ${format(new Date(journey.date), "dd 'de' MMMM", { locale: ptBR })}`}
        subtitle={`${journey.collaborator?.name ?? '-'} \u00b7 ${journey.objective ?? 'Sem objetivo'}`}
        action={
          <button
            onClick={() => router.back()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: '#fff', color: 'var(--color-text-muted)',
              fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <ArrowLeft size={15} /> Voltar
          </button>
        }
      />

      <div style={{ padding: '0 32px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Resumo */}
        <Card>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Route size={14} /> Resumo da Jornada
          </div>
          <InfoRow label="Data" value={format(new Date(journey.date), "dd/MM/yyyy (EEEE)", { locale: ptBR })} />
          <InfoRow label="Inicio" value={journey.started_at ? format(new Date(journey.started_at), 'HH:mm') : '-'} />
          <InfoRow label="Fim" value={journey.ended_at ? format(new Date(journey.ended_at), 'HH:mm') : '-'} />
          <InfoRow label="Distancia GPS" value={`${journey.total_distance_km?.toFixed(1) ?? 0} km`} />
          {odometerKm != null && <InfoRow label="Distancia Odometro" value={`${odometerKm} km`} />}
          <InfoRow label="Tempo em viagem" value={formatMin(journey.total_travel_minutes)} />
          <InfoRow label="Tempo em paradas" value={formatMin(journey.total_stay_minutes)} />
          <InfoRow label="Velocidade media" value={`${journey.average_speed_kmh?.toFixed(0) ?? 0} km/h`} />
          <InfoRow label="Paradas" value={staySegs.length} />
        </Card>

        {/* Detalhes */}
        <Card>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileText size={14} /> Detalhes
          </div>
          <InfoRow label="Colaborador" value={journey.collaborator?.name} />
          <InfoRow label="Objetivo" value={journey.objective} />
          <InfoRow label="Cliente" value={journey.client_name} />
          <InfoRow label="Nota Fiscal" value={journey.invoice_number} />
          <InfoRow label="Valor NF" value={journey.invoice_value != null ? `R$ ${journey.invoice_value.toFixed(2)}` : undefined} />
          <InfoRow label="Origem" value={journey.origin_property?.name ?? journey.origin_name} />
          <InfoRow label="Cidade origem" value={journey.origin_property?.city ?? journey.origin_city} />
          <InfoRow label="Veiculo" value={journey.vehicle_type} />
          <InfoRow label="Placa" value={journey.vehicle_plate} />
          <InfoRow label="Combustivel" value={journey.fuel_type} />
          <InfoRow label="Preco/litro" value={journey.fuel_price_per_liter != null ? `R$ ${journey.fuel_price_per_liter.toFixed(2)}` : undefined} />
          <InfoRow label="KM odometro inicio" value={journey.km_odometer_start?.toLocaleString('pt-BR')} />
          <InfoRow label="KM odometro fim" value={journey.km_odometer_end?.toLocaleString('pt-BR')} />
        </Card>
      </div>

      {/* Timeline dos segmentos */}
      <div style={{ padding: '0 32px 32px' }}>
        <Card>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Navigation size={14} /> Segmentos da Jornada ({journey.segments?.length ?? 0})
          </div>

          {journey.segments?.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-subtle)', fontSize: '0.85rem' }}>
              Nenhum segmento registrado.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {journey.segments?.map((seg) => {
              const isTravel = seg.type === 'travel'
              return (
                <div
                  key={seg.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 16px', borderRadius: 8,
                    background: isTravel ? '#f0f7ff' : 'var(--color-primary-muted)',
                    border: `1px solid ${isTravel ? '#c7ddf7' : '#c5e6c4'}`,
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: isTravel ? '#2563eb' : 'var(--color-primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, marginTop: 2,
                  }}>
                    {isTravel
                      ? <Route size={14} color="#fff" />
                      : <MapPin size={14} color="#fff" />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        {isTravel ? 'Deslocamento' : 'Parada'}
                      </span>
                      <Badge variant={isTravel ? 'cliente' : 'propria'}>
                        #{seg.seq}
                      </Badge>
                      {seg.duration_minutes != null && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          {formatMin(seg.duration_minutes)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      {seg.started_at && format(new Date(seg.started_at), 'HH:mm')}
                      {seg.ended_at && ` - ${format(new Date(seg.ended_at), 'HH:mm')}`}
                      {isTravel && seg.distance_km != null && (
                        <span style={{ marginLeft: 8, fontWeight: 600, color: 'var(--color-text)' }}>
                          {seg.distance_km.toFixed(1)} km
                        </span>
                      )}
                      {!isTravel && (seg.property?.name ?? seg.location_name) && (
                        <span style={{ marginLeft: 8, fontWeight: 500, color: 'var(--color-text)' }}>
                          {seg.property?.name ?? seg.location_name}
                        </span>
                      )}
                    </div>
                    {seg.observations && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4, fontStyle: 'italic' }}>
                        {seg.observations}
                      </div>
                    )}
                    {seg.work_hours != null && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                        Horas trabalhadas: {seg.work_hours}h
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}
