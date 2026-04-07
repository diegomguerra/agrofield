'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { reportsApi } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Loader2 } from 'lucide-react'

const CORES_TIPO = {
  venda: '#238821',
  entrega: '#ca5b21',
  operacao: '#7c3aed',
  outro: '#9a907e',
}

export default function RelatoriosPage() {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))

  const { data: kmMensal, isLoading: l1 } = useQuery({
    queryKey: ['km-mensal', month],
    queryFn: () => reportsApi.kmMensal(month).then((r) => r.data),
  })

  const { data: kmTipo, isLoading: l2 } = useQuery({
    queryKey: ['km-tipo', month],
    queryFn: () => reportsApi.kmPorTipoCusto(month).then((r) => r.data),
  })

  const { data: custoFazendas, isLoading: l3 } = useQuery({
    queryKey: ['custo-fazendas', month],
    queryFn: () => reportsApi.custoFazendasProprias(month).then((r) => r.data),
  })

  const { data: visitasFazenda, isLoading: l4 } = useQuery({
    queryKey: ['visitas-fazenda', month],
    queryFn: () => reportsApi.visitasPorFazenda(month).then((r) => r.data),
  })

  const isLoading = l1 || l2 || l3 || l4

  const pieData = kmTipo?.map((row) => ({
    name: row.tipo_custo,
    value: row.total_km,
    color: CORES_TIPO[row.tipo_custo as keyof typeof CORES_TIPO] ?? '#ccc',
  })) ?? []

  const monthLabel = format(new Date(`${month}-01`), 'MMMM yyyy', { locale: ptBR })

  return (
    <div>
      <PageHeader
        title="Relatórios"
        subtitle={`Análise de ${monthLabel}`}
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

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--color-text-subtle)' }} />
        </div>
      ) : (
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* KM por tipo de custo — pizza */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Card>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 20 }}>KM por tipo de custo</div>
              {pieData.length === 0 ? (
                <p style={{ color: 'var(--color-text-subtle)', fontSize: '0.85rem' }}>Sem dados.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`${v} km`, 'KM']} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* Visitas por fazenda — barras */}
            <Card>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 20 }}>Visitas por propriedade</div>
              {!visitasFazenda?.length ? (
                <p style={{ color: 'var(--color-text-subtle)', fontSize: '0.85rem' }}>Sem dados.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={visitasFazenda} layout="vertical" margin={{ left: 0, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--color-text-subtle)' }} />
                    <YAxis
                      type="category"
                      dataKey="property_name"
                      width={110}
                      tick={{ fontSize: 11, fill: 'var(--color-text)' }}
                    />
                    <Tooltip />
                    <Bar dataKey="total_visitas" name="Visitas" fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* Custo fazendas próprias */}
          <Card>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 20 }}>
              Fazendas próprias — horas e insumos
            </div>
            {!custoFazendas?.length ? (
              <p style={{ color: 'var(--color-text-subtle)', fontSize: '0.85rem' }}>Sem dados para fazendas próprias.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    {['Fazenda', 'Horas trabalhadas', 'Total insumos'].map((h) => (
                      <th key={h} style={{
                        padding: '8px 12px',
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
                  {custoFazendas.map((row) => (
                    <tr key={row.property_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '10px 12px', fontSize: '0.875rem', fontWeight: 500 }}>
                        {row.property_name}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '0.875rem' }}>
                        {row.total_horas?.toLocaleString('pt-BR')} h
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '0.875rem' }}>
                        R$ {row.total_insumos?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
