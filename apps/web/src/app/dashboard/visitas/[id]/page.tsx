'use client'

import { useQuery } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { visitsApi } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { ArrowLeft, Loader2, MapPin, Ruler, Clock, Package, ShoppingCart, CheckSquare } from 'lucide-react'

export default function VisitaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const { data: visit, isLoading } = useQuery({
    queryKey: ['visit', id],
    queryFn: () => visitsApi.get(id).then((r) => r.data),
  })

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--color-text-subtle)' }} />
      </div>
    )
  }

  if (!visit) return null

  const isPropria = visit.property?.tipo === 'propria'
  const km = visit.km_start != null && visit.km_end != null ? visit.km_end - visit.km_start : null

  return (
    <div>
      <PageHeader
        title={visit.property?.name ?? 'Visita'}
        subtitle={format(new Date(visit.date), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
        action={
          <button
            onClick={() => router.back()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: '#fff', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '0.875rem',
              color: 'var(--color-text-muted)',
            }}
          >
            <ArrowLeft size={15} /> Voltar
          </button>
        }
      />

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Cabeçalho da visita */}
        <Card style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <InfoItem icon={<MapPin size={15} />} label="Propriedade">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600 }}>{visit.property?.name}</span>
              <Badge variant={isPropria ? 'propria' : 'cliente'}>
                {isPropria ? 'Própria' : 'Cliente'}
              </Badge>
            </div>
            {visit.property?.city && (
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>
                {visit.property.city}
              </div>
            )}
          </InfoItem>

          {km != null && (
            <InfoItem icon={<Ruler size={15} />} label="KM rodados">
              <span style={{ fontWeight: 600 }}>{km.toLocaleString('pt-BR')} km</span>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>
                {visit.km_start?.toLocaleString('pt-BR')} → {visit.km_end?.toLocaleString('pt-BR')}
              </div>
            </InfoItem>
          )}

          {(visit as any).work_hours?.length > 0 && (
            <InfoItem icon={<Clock size={15} />} label="Horas trabalhadas">
              <span style={{ fontWeight: 600 }}>
                {(visit as any).work_hours.reduce((a: number, w: any) => a + (w.hours ?? 0), 0)} h
              </span>
            </InfoItem>
          )}
        </Card>

        {/* Observações */}
        {visit.observations && (
          <Card>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Observações
            </div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text)', lineHeight: 1.6 }}>
              {visit.observations}
            </p>
          </Card>
        )}

        {/* Fazenda própria: checkpoints */}
        {isPropria && (
          <Card>
            <SectionTitle icon={<CheckSquare size={15} />} title="Checkpoints digitais" />
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(visit as any).checkpoints?.length > 0
                ? (visit as any).checkpoints.map((c: string, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem' }}>
                      <div style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--color-primary)', flexShrink: 0 }} />
                      {c}
                    </div>
                  ))
                : <Empty>Nenhum checkpoint registrado.</Empty>}
            </div>
          </Card>
        )}

        {/* Fazenda própria: insumos */}
        {isPropria && (
          <Card>
            <SectionTitle icon={<Package size={15} />} title="Insumos utilizados" />
            <div style={{ marginTop: 12 }}>
              {(visit as any).property_inputs?.length > 0
                ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                        {['Produto', 'Quantidade', 'Unidade'].map((h) => (
                          <th key={h} style={{ padding: '8px 0', textAlign: 'left', fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(visit as any).property_inputs.map((inp: any) => (
                        <tr key={inp.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '10px 0', fontSize: '0.875rem', fontWeight: 500 }}>{inp.product?.name ?? '—'}</td>
                          <td style={{ padding: '10px 0', fontSize: '0.875rem' }}>{inp.quantity}</td>
                          <td style={{ padding: '10px 0', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{inp.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
                : <Empty>Nenhum insumo registrado.</Empty>}
            </div>
          </Card>
        )}

        {/* Cliente: serviços */}
        {!isPropria && (
          <Card>
            <SectionTitle icon={<CheckSquare size={15} />} title="Serviços prestados" />
            <div style={{ marginTop: 12 }}>
              {visit.visit_services?.length
                ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                        {['Serviço', 'Tipo', 'Qtd', 'Valor unit.', 'Total'].map((h) => (
                          <th key={h} style={{ padding: '8px 0', textAlign: 'left', fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visit.visit_services.map((s) => (
                        <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '10px 0', fontSize: '0.875rem', fontWeight: 500 }}>{s.service_type?.name ?? '—'}</td>
                          <td style={{ padding: '10px 0' }}>
                            <Badge variant={s.service_type?.tipo_custo === 'venda' ? 'propria' : 'default'}>
                              {s.service_type?.tipo_custo ?? '—'}
                            </Badge>
                          </td>
                          <td style={{ padding: '10px 0', fontSize: '0.875rem' }}>{s.quantity ?? '—'}</td>
                          <td style={{ padding: '10px 0', fontSize: '0.875rem' }}>
                            {s.unit_price != null ? `R$ ${s.unit_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                          </td>
                          <td style={{ padding: '10px 0', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-primary-dark)' }}>
                            {s.quantity != null && s.unit_price != null
                              ? `R$ ${(s.quantity * s.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
                : <Empty>Nenhum serviço registrado.</Empty>}
            </div>
          </Card>
        )}

        {/* Cliente: vendas */}
        {!isPropria && (
          <Card>
            <SectionTitle icon={<ShoppingCart size={15} />} title="Vendas" />
            <div style={{ marginTop: 12 }}>
              {visit.visit_sales?.length
                ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                        {['Produto', 'Qtd', 'Valor unit.', 'Total'].map((h) => (
                          <th key={h} style={{ padding: '8px 0', textAlign: 'left', fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visit.visit_sales.map((s) => (
                        <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '10px 0', fontSize: '0.875rem', fontWeight: 500 }}>{s.product?.name ?? '—'}</td>
                          <td style={{ padding: '10px 0', fontSize: '0.875rem' }}>{s.quantity} {s.product?.unit ?? ''}</td>
                          <td style={{ padding: '10px 0', fontSize: '0.875rem' }}>
                            R$ {s.unit_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '10px 0', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-primary-dark)' }}>
                            R$ {(s.quantity * s.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
                : <Empty>Nenhuma venda registrada.</Empty>}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

function InfoItem({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
        {icon} {label}
      </div>
      {children}
    </div>
  )
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text)' }}>
      <span style={{ color: 'var(--color-text-muted)' }}>{icon}</span>
      {title}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-subtle)', fontStyle: 'italic' }}>
      {children}
    </p>
  )
}
