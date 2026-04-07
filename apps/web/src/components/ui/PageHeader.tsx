interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div style={{
      padding: '28px 32px 20px',
      borderBottom: '1px solid var(--color-border)',
      background: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
    }}>
      <div>
        <h1 className="font-display" style={{
          margin: 0,
          fontSize: '1.35rem',
          fontWeight: 700,
          color: 'var(--color-text)',
          lineHeight: 1.2,
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{
            margin: '4px 0 0',
            fontSize: '0.85rem',
            color: 'var(--color-text-muted)',
          }}>
            {subtitle}
          </p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
