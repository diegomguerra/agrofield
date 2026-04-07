interface BadgeProps {
  children: React.ReactNode
  variant?: 'propria' | 'cliente' | 'default' | 'success' | 'warning'
}

const STYLES = {
  propria: { background: '#dcf5db', color: '#1d6c1c' },
  cliente: { background: '#faecda', color: '#a8451d' },
  success: { background: '#dcf5db', color: '#1d6c1c' },
  warning: { background: '#fef9c3', color: '#854d0e' },
  default: { background: 'var(--color-bg)', color: 'var(--color-text-muted)' },
}

export function Badge({ children, variant = 'default' }: BadgeProps) {
  const style = STYLES[variant]
  return (
    <span style={{
      ...style,
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 8px',
      borderRadius: 99,
      fontSize: '0.72rem',
      fontWeight: 600,
      letterSpacing: '0.01em',
      textTransform: 'uppercase',
    }}>
      {children}
    </span>
  )
}
