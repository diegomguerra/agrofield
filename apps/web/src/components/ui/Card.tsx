import { clsx } from 'clsx'

interface CardProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  padding?: string
}

export function Card({ children, className, style, padding = '20px' }: CardProps) {
  return (
    <div
      className={clsx('animate-fade-in', className)}
      style={{
        background: '#fff',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  icon?: React.ReactNode
  color?: string
}

export function StatCard({ label, value, sub, icon, color = 'var(--color-primary)' }: StatCardProps) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', fontWeight: 500, marginBottom: 6 }}>
            {label}
          </div>
          <div className="font-display" style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1 }}>
            {value}
          </div>
          {sub && (
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)', marginTop: 6 }}>
              {sub}
            </div>
          )}
        </div>
        {icon && (
          <div style={{
            width: 36, height: 36,
            borderRadius: 8,
            background: color + '18',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color,
            flexShrink: 0,
          }}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  )
}
