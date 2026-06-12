import { colorFor, fmtMoney } from '../utils'

export interface HBarItem {
  label: string
  value: number
  count?: number
}

export function HBar({ items, max, height = 14, onClick }: {
  items: HBarItem[]
  max?: number
  height?: number
  onClick?: (label: string) => void
}) {
  if (!items.length) return <div style={{ padding: 30, color: 'var(--muted)', fontSize: 13, textAlign: 'center' }}>No data</div>
  const m = max ?? Math.max(...items.map(i => i.value))
  return (
    <div>
      {items.map((it, i) => {
        const w = (it.value / m) * 100
        return (
          <div key={it.label}
               onClick={() => onClick?.(it.label)}
               style={{
                 display: 'grid', gridTemplateColumns: '160px 1fr 90px',
                 alignItems: 'center', gap: 12, padding: '7px 0',
                 borderTop: i === 0 ? 'none' : '1px solid var(--line-soft)',
                 cursor: onClick ? 'pointer' : 'default',
               }}>
            <div style={{ fontSize: 12.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {it.label}
            </div>
            <div style={{ position: 'relative', height }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, height,
                width: `${w}%`, background: colorFor(it.label), opacity: 0.85,
              }} />
            </div>
            <div className="num" style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>
              {fmtMoney(it.value)}
              {it.count != null && (
                <span style={{ color: 'var(--muted-2)', marginLeft: 6, fontSize: 10.5 }}>×{it.count}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
