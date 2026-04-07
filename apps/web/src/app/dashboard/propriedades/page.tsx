'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { propertiesApi } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { MapPin, Loader2, Search } from 'lucide-react'

export default function PropriedadesPage() {
  const [filtro, setFiltro] = useState<'todas' | 'propria' | 'cliente'>('todas')
  const [busca, setBusca] = useState('')

  const { data: properties, isLoading } = useQuery({
    queryKey: ['properties'],
    queryFn: () => propertiesApi.list().then((r) => r.data),
  })

  const filtradas = properties?.filter((p) => {
    const matchTipo = filtro === 'todas' || p.tipo === filtro
    const matchBusca = p.name.toLowerCase().includes(busca.toLowerCase()) ||
      (p.city ?? '').toLowerCase().includes(busca.toLowerCase())
    return matchTipo && matchBusca
  })

  const proprias = properties?.filter((p) => p.tipo === 'propria').length ?? 0
  const clientes = properties?.filter((p) => p.tipo === 'cliente').length ?? 0

  return (
    <div>
      <PageHeader
        title="Propriedades"
        subtitle={`${proprias} fazendas próprias · ${clientes} clientes`}
      />

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Filtros */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Busca */}
          <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
            <Search size={15} style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--color-text-subtle)',
            }} />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar propriedade ou cidade…"
              style={{
                width: '100%',
                padding: '8px 12px 8px 32px',
                borderRadius: 6,
                border: '1px solid var(--color-border)',
                background: '#fff',
                fontSize: '0.875rem',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Tabs de tipo */}
          {(['todas', 'propria', 'cliente'] as const).map((tipo) => (
            <button
              key={tipo}
              onClick={() => setFiltro(tipo)}
              style={{
                padding: '7px 14px',
                borderRadius: 6,
                border: '1px solid',
                borderColor: filtro === tipo ? 'var(--color-primary)' : 'var(--color-border)',
                background: filtro === tipo ? 'var(--color-primary-muted)' : '#fff',
                color: filtro === tipo ? 'var(--color-primary-dark)' : 'var(--color-text-muted)',
                fontSize: '0.8rem',
                fontWeight: filtro === tipo ? 600 : 400,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
            >
              {tipo === 'todas' ? 'Todas' : tipo === 'propria' ? 'Próprias' : 'Clientes'}
            </button>
          ))}
        </div>

        {/* Lista */}
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-text-subtle)' }} />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {filtradas?.map((p) => (
              <Card key={p.id} padding="18px" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: p.tipo === 'propria' ? 'var(--color-primary-muted)' : 'var(--color-soil-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <MapPin
                        size={15}
                        style={{ color: p.tipo === 'propria' ? 'var(--color-primary)' : 'var(--color-soil)' }}
                      />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.2 }}>{p.name}</div>
                      {p.city && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>
                          {p.city}
                        </div>
                      )}
                    </div>
                  </div>
                  <Badge variant={p.tipo}>
                    {p.tipo === 'propria' ? 'Própria' : 'Cliente'}
                  </Badge>
                </div>

                {p.area_hectares && (
                  <div style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: 'var(--color-bg)',
                    fontSize: '0.8rem',
                    color: 'var(--color-text-muted)',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}>
                    <span>Área</span>
                    <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                      {p.area_hectares.toLocaleString('pt-BR')} ha
                    </span>
                  </div>
                )}

                {p.tipo === 'propria' && (
                  <div style={{
                    fontSize: '0.72rem',
                    color: 'var(--color-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}>
                    ✓ Checkpoint digital · Insumos · Horas
                  </div>
                )}
              </Card>
            ))}

            {filtradas?.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 48, color: 'var(--color-text-subtle)' }}>
                Nenhuma propriedade encontrada.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
