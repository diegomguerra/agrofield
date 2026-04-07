'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { dailyLogsApi } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Loader2, Fuel, Ruler } from 'lucide-react'

export default function KmDiarioPage() {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))

  const { data: logs, isLoading } = useQuery({
    queryKey: ['daily-logs', month],
    queryFn: () => dailyLogsApi.list({ month }).then((r) => r.data),
  })

  const totalKm = logs?.reduce((acc, l) => {
    if (l.km_start != null && l.km_end != null) acc += l.km_end - l.km_start
    return acc
  }, 0) ?? 0

  const totalCombustivel = logs?.reduce((acc, l) => acc + (l.fuel_cost ?? 0), 0) ?? 0

  const monthLabel = format(new Date(`${month}-01`), 'MMMM yyyy', { locale: ptBR })

  return (
    <div>
      <PageHeader
        title="KM Diário"
        subtitle={`Registros de ${monthLabel}`}
        action={
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{
              padding: '7px 12px',
              borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: '#fff',
              fontSize: '0.875rem',
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
        }
      />

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Totais do mês */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Card style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: 'var(--color-primary-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Ruler size={20} style={{ color: 'var(--color-primary)' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Total KM no mês</div>
              <div className="font-display" style={{ fontSize: '1.6rem', fontWeight: 700 }}>
                {totalKm.toLocaleString('pt-BR')} km
              </div>
            </div>
          </Card>

          <Card style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: 'var(--color-soil-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Fuel size={20} style={{ color: 'var(--color-soil)' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Custo combustível</div>
              <div className="font-display" style={{ fontSize: '1.6rem', fontWeight: 700 }}>
                R$ {totalCombustivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </Card>
        </div>

        {/* Tabela de logs */}
        <Card padding="0">
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-text-subtle)' }} />
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {['Data', 'Colaborador', 'Veículo', 'KM inicial', 'KM final', 'KM rodados', 'Combustível'].map((h) => (
                    <th key={h} style={{
                      padding: '11px 16px',
                      textAlign: 'left',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: 'var(--color-text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs?.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--color-text-subtle)', fontSize: '0.875rem' }}>
                      Nenhum registro neste mês.
                    </td>
                  </tr>
                )}
                {logs?.map((log, i) => {
                  const km = log.km_start != null && log.km_end != null ? log.km_end - log.km_start : null
                  return (
                    <tr
                      key={log.id}
                      style={{ borderBottom: i < (logs.length - 1) ? '1px solid var(--color-border)' : 'none' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '11px 16px', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                        {format(new Date(log.date), "dd MMM", { locale: ptBR })}
                      </td>
                      <td style={{ padding: '11px 16px', fontSize: '0.875rem', fontWeight: 500 }}>
                        {(log as any).collaborator?.name ?? '—'}
                      </td>
                      <td style={{ padding: '11px 16px', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                        {(log as any).vehicle?.plate ?? '—'}
                      </td>
                      <td style={{ padding: '11px 16px', fontSize: '0.875rem' }}>{log.km_start?.toLocaleString('pt-BR') ?? '—'}</td>
                      <td style={{ padding: '11px 16px', fontSize: '0.875rem' }}>{log.km_end?.toLocaleString('pt-BR') ?? '—'}</td>
                      <td style={{ padding: '11px 16px', fontSize: '0.875rem', fontWeight: km ? 600 : 400, color: 'var(--color-primary-dark)' }}>
                        {km != null ? `${km.toLocaleString('pt-BR')} km` : '—'}
                      </td>
                      <td style={{ padding: '11px 16px', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                        {log.fuel_cost != null ? `R$ ${log.fuel_cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
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
