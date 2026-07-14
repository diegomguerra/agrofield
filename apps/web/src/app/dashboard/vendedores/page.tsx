'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, differenceInDays, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { vendedoresApi, tenantUsersApi, type VendedorStats } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Loader2, Users, Route, Award } from 'lucide-react'
import Link from 'next/link'

function fmtNum(value: number) {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

function fmtBRL(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

const MEDAL_COLORS = ['#f59e0b', '#9ca3af', '#cd7c2e']
const MEDAL_LABELS = ['1º', '2º', '3º']

export default function VendedoresPage() {
  const { data: vendedoresStats, isLoading: loadingStats } = useQuery({
    queryKey: ['vendedores-stats'],
    queryFn: () => vendedoresApi.stats().then((r) => r.data),
  })

  const { data: allUsers, isLoading: loadingUsers } = useQuery({
    queryKey: ['tenant-users'],
    queryFn: () => tenantUsersApi.list().then((r) => r.data),
  })

  const vendedores = useMemo(() => {
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
          horas_viagem: s?.horas_viagem ?? 0,
          media_km_jornada: s?.media_km_jornada ?? 0,
          dias_ativos: s?.dias_ativos ?? 0,
          primeira_jornada: s?.primeira_jornada,
          ultima_jornada: s?.ultima_jornada,
          custo_combustivel: s?.custo_combustivel ?? 0,
          veiculo_principal: s?.veiculo_principal,
          objetivo_principal: s?.objetivo_principal,
          status: statusVendedor(s?.ultima_jornada),
        }
      })
      .sort((a, b) => b.total_km - a.total_km)
  }, [allUsers, vendedoresStats])

  const isLoading = loadingStats || loadingUsers

  const totalVendedores = vendedores.length
  const comJornadas = vendedores.filter((v) => v.total_jornadas > 0).length
  const semJornadas = totalVendedores - comJornadas

  return (
    <div>
      <PageHeader
        title="Vendedores"
        subtitle={`${totalVendedores} vendedor${totalVendedores !== 1 ? 'es' : ''} · ${comJornadas} com jornadas registradas`}
      />

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Resumo rápido */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--color-primary-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={18} style={{ color: 'var(--color-primary)' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Total de Vendedores</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{totalVendedores}</div>
              </div>
            </div>
          </Card>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: '#dcf5db', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Route size={18} style={{ color: '#1d6c1c' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Com Jornadas</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{comJornadas}</div>
              </div>
            </div>
          </Card>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: '#fef9c3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Award size={18} style={{ color: '#a16207' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Sem Registro</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{semJornadas}</div>
              </div>
            </div>
          </Card>
        </div>

        {/* Ranking e lista */}
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--color-text-subtle)' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {vendedores.map((v, i) => {
              const hasMedal = i < 3 && v.total_km > 0
              return (
                <Card key={v.id}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                    {/* Ranking ou posição */}
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: hasMedal ? MEDAL_COLORS[i] + '22' : 'var(--color-bg)',
                      fontWeight: 700,
                      fontSize: hasMedal ? '1rem' : '0.85rem',
                      color: hasMedal ? MEDAL_COLORS[i] : 'var(--color-text-subtle)',
                    }}>
                      {hasMedal ? MEDAL_LABELS[i] : `${i + 1}º`}
                    </div>

                    {/* Dados principais */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--color-text)' }}>
                          {v.nome}
                        </span>
                        {v.perfil && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)', textTransform: 'capitalize' }}>
                            {v.perfil}
                          </span>
                        )}
                        <StatusBadge status={v.status} />
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 24px' }}>
                        <div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                            Jornadas
                          </span>
                          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text)', marginTop: 2 }}>
                            {v.total_jornadas}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                            KM Total
                          </span>
                          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text)', marginTop: 2 }}>
                            {v.total_km > 0 ? `${fmtNum(v.total_km)} km` : '—'}
                          </div>
                        </div>
                        {v.media_km_jornada > 0 && (
                          <div>
                            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                              Média/Jornada
                            </span>
                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text)', marginTop: 2 }}>
                              {fmtNum(v.media_km_jornada)} km
                            </div>
                          </div>
                        )}
                        {v.dias_ativos > 0 && (
                          <div>
                            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                              Dias Ativos
                            </span>
                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text)', marginTop: 2 }}>
                              {v.dias_ativos}
                            </div>
                          </div>
                        )}
                        {v.custo_combustivel > 0 && (
                          <div>
                            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                              Custo Combustível
                            </span>
                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text)', marginTop: 2 }}>
                              R$ {fmtBRL(v.custo_combustivel)}
                            </div>
                          </div>
                        )}
                        {v.ultima_jornada && (
                          <div>
                            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                              Última Jornada
                            </span>
                            <div style={{ fontSize: '0.9rem', color: 'var(--color-text)', marginTop: 2 }}>
                              {format(parseISO(v.ultima_jornada), "dd 'de' MMM yyyy", { locale: ptBR })}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Tags secundárias */}
                      {(v.veiculo_principal || v.objetivo_principal) && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                          {v.veiculo_principal && (
                            <Badge variant="default">{v.veiculo_principal}</Badge>
                          )}
                          {v.objetivo_principal && (
                            <Badge variant="cliente">{v.objetivo_principal}</Badge>
                          )}
                        </div>
                      )}

                      {v.total_jornadas === 0 && (
                        <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--color-text-subtle)', fontStyle: 'italic' }}>
                          Nenhuma jornada registrada. O vendedor precisa usar o app mobile.
                        </p>
                      )}
                    </div>

                    {/* Link para jornadas do vendedor */}
                    {v.total_jornadas > 0 && (
                      <div style={{ flexShrink: 0 }}>
                        <Link
                          href={`/dashboard/jornadas?vendedor=${v.id}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '6px 12px',
                            borderRadius: 6,
                            border: '1px solid var(--color-border)',
                            fontSize: '0.78rem',
                            color: 'var(--color-text-muted)',
                            textDecoration: 'none',
                            fontWeight: 500,
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--color-primary-muted)'
                            e.currentTarget.style.color = 'var(--color-primary-dark)'
                            e.currentTarget.style.borderColor = 'var(--color-primary)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.color = 'var(--color-text-muted)'
                            e.currentTarget.style.borderColor = 'var(--color-border)'
                          }}
                        >
                          <Route size={13} />
                          Ver jornadas
                        </Link>
                      </div>
                    )}
                  </div>
                </Card>
              )
            })}

            {vendedores.length === 0 && (
              <Card>
                <p style={{ textAlign: 'center', color: 'var(--color-text-subtle)', padding: '24px 0', margin: 0, fontSize: '0.875rem' }}>
                  Nenhum vendedor encontrado.
                </p>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
