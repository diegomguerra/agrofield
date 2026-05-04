'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/lib/store'
import {
  Sprout,
  LayoutDashboard,
  MapPin,
  CalendarCheck,
  BarChart3,
  Truck,
  Route,
  LogOut,
} from 'lucide-react'

const NAV = [
  { href: '/dashboard', label: 'Início', icon: LayoutDashboard },
  { href: '/dashboard/jornadas', label: 'Jornadas', icon: Route },
  { href: '/dashboard/propriedades', label: 'Propriedades', icon: MapPin },
  { href: '/dashboard/visitas', label: 'Visitas', icon: CalendarCheck },
  { href: '/dashboard/km-diario', label: 'KM Diário', icon: Truck },
  { href: '/dashboard/relatorios', label: 'Relatórios', icon: BarChart3 },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { isAuthenticated, user, logout } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated()) router.push('/login')
  }, [isAuthenticated, router])

  if (!isAuthenticated()) return null

  function handleLogout() {
    logout()
    router.push('/login')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Sidebar */}
      <aside style={{
        width: 'var(--sidebar-width)',
        background: '#fff',
        borderRight: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0, left: 0, bottom: 0,
        zIndex: 40,
      }}>
        {/* Logo */}
        <div style={{
          padding: '18px 16px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <div style={{
            width: 32, height: 32,
            borderRadius: 8,
            background: 'var(--color-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Sprout size={17} color="#fff" />
          </div>
          <div>
            <div className="font-display" style={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.1 }}>
              AgroField
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--color-text-subtle)', marginTop: 1 }}>
              Inseminas
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 6,
                  fontSize: '0.875rem',
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--color-primary-dark)' : 'var(--color-text-muted)',
                  background: active ? 'var(--color-primary-muted)' : 'transparent',
                  textDecoration: 'none',
                  transition: 'all 0.15s',
                }}
              >
                <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Footer do sidebar — usuário + logout */}
        <div style={{
          padding: '12px 8px',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          <div style={{
            padding: '8px 10px',
            borderRadius: 6,
            background: 'var(--color-bg)',
          }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text)' }}>
              {user?.name ?? '—'}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)', textTransform: 'capitalize' }}>
              {user?.role ?? ''}
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px',
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: 'var(--color-text-subtle)',
              fontSize: '0.875rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
              width: '100%',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#fff5f5'
              e.currentTarget.style.color = '#dc2626'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--color-text-subtle)'
            }}
          >
            <LogOut size={15} />
            Sair
          </button>
        </div>
      </aside>

      {/* Conteúdo principal */}
      <main style={{
        marginLeft: 'var(--sidebar-width)',
        flex: 1,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {children}
      </main>
    </div>
  )
}
