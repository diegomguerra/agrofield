'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { Sprout, AlertCircle, Loader2 } from 'lucide-react'

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
      {/* Painel esquerdo — identidade visual */}
      <div
        className="hidden lg:flex flex-col justify-between w-[420px] p-10"
        style={{ background: 'var(--color-primary-dark)', color: '#fff' }}
      >
        <div className="flex items-center gap-3">
          <Sprout size={28} />
          <span className="font-display text-xl font-bold tracking-tight">AgroField</span>
        </div>

        <div>
          <p className="font-display text-4xl font-bold leading-tight mb-4">
            Gestão de campo.<br />
            Simples e precisa.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.95rem' }}>
            Controle de visitas, KM, insumos e relatórios para a Inseminas e suas fazendas parceiras.
          </p>
        </div>

        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
          Inovação Agropecuária · Lagoa da Prata, MG
        </div>
      </div>

      {/* Painel direito — formulário */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Logo mobile */}
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <Sprout size={22} style={{ color: 'var(--color-primary)' }} />
            <span className="font-display text-lg font-bold">AgroField</span>
          </div>

          <h1 className="font-display text-2xl font-bold mb-1">Entrar</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
            Acesso restrito à equipe Inseminas
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="email"
                style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-muted)', display: 'block', marginBottom: 6 }}
              >
                E-mail
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 6,
                  border: '1.5px solid var(--color-border)',
                  background: '#fff',
                  fontSize: '0.95rem',
                  outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--color-primary)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-muted)', display: 'block', marginBottom: 6 }}
              >
                Senha
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 6,
                  border: '1.5px solid var(--color-border)',
                  background: '#fff',
                  fontSize: '0.95rem',
                  outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--color-primary)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
              />
            </div>

            {error && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  borderRadius: 6,
                  background: '#fff5f5',
                  border: '1px solid #fecaca',
                  color: '#dc2626',
                  fontSize: '0.875rem',
                }}
              >
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '11px',
                borderRadius: 6,
                border: 'none',
                background: loading ? 'var(--color-border-strong)' : 'var(--color-primary)',
                color: '#fff',
                fontFamily: 'inherit',
                fontSize: '0.95rem',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'background 0.15s',
                marginTop: 4,
              }}
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : null}
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
