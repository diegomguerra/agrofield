'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { Sprout, AlertCircle, Loader2 } from 'lucide-react'

const PERFIS_ADM = ['admin', 'gestor', 'socio', 'financeiro']

export default function LoginPage() {
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await authApi.login(email, password)

      // Bloqueia técnicos e vendedores no painel web
      if (!PERFIS_ADM.includes(data.user.role)) {
        setError('Acesso negado. Use o aplicativo mobile para entrar.')
        setLoading(false)
        return
      }

      login(data.token, data.user)
      router.push('/dashboard')
    } catch {
      setError('E-mail ou senha inválidos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--color-bg)' }}>
      {/* Painel esquerdo */}
      <div
        className="hidden lg:flex flex-col justify-between p-10"
        style={{ width: 420, background: 'var(--color-primary-dark)', color: '#fff' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Sprout size={28} />
          <span className="font-display" style={{ fontSize: '1.2rem', fontWeight: 700 }}>AgroField</span>
        </div>
        <div>
          <p className="font-display" style={{ fontSize: '2.2rem', fontWeight: 800, lineHeight: 1.2, marginBottom: 16 }}>
            Gestão de campo.<br />Simples e precisa.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.95rem', lineHeight: 1.6 }}>
            Controle de visitas, KM, insumos e relatórios para suas fazendas e equipes de campo.
          </p>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem' }}>
          AgroField · Gestão Agropecuária
        </div>
      </div>

      {/* Formulário */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <div className="lg:hidden" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 40 }}>
            <Sprout size={22} style={{ color: 'var(--color-primary)' }} />
            <span className="font-display" style={{ fontWeight: 700, fontSize: '1.1rem' }}>AgroField</span>
          </div>

          <h1 className="font-display" style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: 4 }}>Entrar</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: 32 }}>
            Acesso restrito à equipe de gestão
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 6,
                  border: '1.5px solid var(--color-border)', background: '#fff',
                  fontSize: '0.95rem', outline: 'none', fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--color-primary)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 6,
                  border: '1.5px solid var(--color-border)', background: '#fff',
                  fontSize: '0.95rem', outline: 'none', fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--color-primary)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
              />
            </div>

            {error && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 6,
                background: '#fff5f5', border: '1px solid #fecaca',
                color: '#dc2626', fontSize: '0.875rem',
              }}>
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: 12, borderRadius: 6, border: 'none',
                background: loading ? 'var(--color-border-strong)' : 'var(--color-primary)',
                color: '#fff', fontFamily: 'inherit', fontSize: '0.95rem',
                fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 8, marginTop: 4,
              }}
            >
              {loading && <Loader2 size={18} className="animate-spin" />}
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
