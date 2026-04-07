'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { visitsApi } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Loader2, ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'

export default function VisitasPage() {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))

  const dateFrom = `${month}-01`
  const dateTo = `${month}-31`

  const { data: visits, isLoading } = useQuery({
    queryKey: ['visits', month],
    queryFn: () => visitsApi.list({ date_from: dateFrom, date_to: dateTo }).then((r) => r.data),
  })

  const proprias = visits?.filter((v) => v.property?.tipo === 'propria').length ?? 0
  const clientes = visits?.filter((v) => v.property?.tipo === 'cliente').length ?? 0

  return (
    <div>
      <PageHeader
        title="Visitas"
        subtitle={`${proprias} fazendas próprias · ${clientes} clientes`}
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
            <Link
              href="/dashboard/visitas/nova"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 6,
                background: 'var(--color-primary)', color: '#fff',
                fontSize: '0.875rem', fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <Plus size={15} /> Nova visita
            </Link>
          </div>
        }
      />

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
                  {['Data', 'Propriedade', 'Tipo', 'KM rodados', 'Serviços / Vendas', ''].map((h) => (
                    <th key={h} style={{
                      padding: '12px 16px', textAlign: 'left',
                      fontSize: '0.75rem', fontWeight: 600,
                      color: 'var(--color-text-muted)',
                      letterSpacing: '0.03em', textTransform: 'uppercase',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visits?.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 48, color: 'var(--color-text-subtle)', fontSize: '0.875rem' }}>
                      Nenhuma visita registrada neste mês.
                    </td>
                  </tr>
                )}
                {visits?.map((visit, i) => {
                  const km = visit.km_start != null && visit.km_end != null
                    ? visit.km_end - visit.km_start : null
                  const servicos = visit.visit_services?.length ?? 0
                  const vendas = visit.visit_sales?.length ?? 0

                  return (
                    <tr
                      key={visit.id}
                      style={{
                        borderBottom: i < (visits.length - 1) ? '1px solid var(--color-border)' : 'none',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 16px', fontSize: '0.875rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        {format(new Date(visit.date), 'dd MMM', { locale: ptBR })}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.875rem', fontWeight: 500 }}>
                        {visit.property?.name ?? '—'}
                        {visit.property?.city && (
                          <span style={{ fontWeight: 400, color: 'var(--color-text-subtle)', marginLeft: 6, fontSize: '0.8rem' }}>
                            {visit.property.city}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Badge variant={visit.property?.tipo as 'propria' | 'cliente'}>
                          {visit.property?.tipo === 'propria' ? 'Própria' : 'Cliente'}
                        </Badge>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.875rem', fontWeight: km ? 600 : 400, color: km ? 'var(--color-text)' : 'var(--color-text-subtle)' }}>
                        {km != null ? `${km} km` : '—'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                        {visit.property?.tipo === 'cliente'
                          ? `${servicos} serv. · ${vendas} venda${vendas !== 1 ? 's' : ''}`
                          : '—'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Link href={`/dashboard/visitas/${visit.id}`} style={{ color: 'var(--color-text-subtle)', display: 'flex' }}>
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
