import type { ReactNode, CSSProperties } from 'react'

interface CardProps {
  children: ReactNode
  style?: CSSProperties
  padding?: number
  title?: string
  eyebrow?: string
  action?: ReactNode
}

export function Card({ children, style, padding = 20, title, eyebrow, action }: CardProps) {
  return (
    <div style={{
      background: 'var(--paper)',
      border: '1px solid var(--line)',
      borderRadius: 4,
      padding,
      ...style,
    }}>
      {(title || eyebrow || action) && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            {eyebrow && <div className="eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</div>}
            {title && <div className="serif" style={{ fontSize: 20, lineHeight: 1.15, color: 'var(--ink)' }}>{title}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

export function Stat({ label, value, sub, color = 'var(--ink)' }: {
  label: string; value: ReactNode; sub?: ReactNode; color?: string
}) {
  return (
    <div style={{
      background: 'var(--paper)', border: '1px solid var(--line)',
      borderRadius: 4, padding: '16px 18px',
    }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div className="num serif" style={{ fontSize: 28, fontWeight: 500, color, lineHeight: 1, letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>{sub}</div>
      )}
    </div>
  )
}
