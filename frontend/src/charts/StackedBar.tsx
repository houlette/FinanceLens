import { useRef, useState, useEffect } from 'react'
import { fmtMonth, fmtMoney, colorFor } from '../utils'

export interface StackedBarProps {
  months: string[]                            // x-axis labels (YYYY-MM)
  categories: string[]                        // stack order
  data: { month: string; values: Record<string, number> }[]
  height?: number
  onClickCategory?: (category: string) => void
}

export function StackedBar({ months, categories, data, height = 280, onClickCategory }: StackedBarProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(640)
  const [hover, setHover] = useState<{ month: string; cat: string; v: number; x: number; y: number } | null>(null)

  useEffect(() => {
    const measure = () => { if (ref.current) setW(ref.current.clientWidth) }
    measure()
    const ro = new ResizeObserver(measure)
    if (ref.current) ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])

  if (!months.length) return <Empty />

  const padL = 48, padR = 16, padT = 12, padB = 28, legendW = 168
  const plotW = w - padL - padR - legendW
  const plotH = height - padT - padB

  const totals = data.map(d => categories.reduce((s, c) => s + (d.values[c] || 0), 0))
  const yMax = Math.max(...totals, 1)
  const yTickStep = niceStep(yMax / 5)
  const yTicks: number[] = []
  for (let v = 0; v <= yMax * 1.05; v += yTickStep) yTicks.push(v)

  const barGap = 6
  const barW = (plotW - barGap * (months.length - 1)) / months.length
  const xPos = (i: number) => padL + i * (barW + barGap)
  const yPos = (v: number) => padT + (1 - v / yMax) * plotH

  return (
    <div ref={ref} style={{ width: '100%', position: 'relative' }}>
      <svg width={w} height={height}>
        {/* y gridlines + labels */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={padL + plotW} y1={yPos(t)} y2={yPos(t)}
                  stroke="var(--line-soft)" strokeWidth={0.5} />
            <text x={padL - 6} y={yPos(t) + 3} textAnchor="end"
                  style={{ fontSize: 10, fill: 'var(--muted)' }}
                  fontFamily="JetBrains Mono">
              {compactMoney(t)}
            </text>
          </g>
        ))}

        {/* bars */}
        {data.map((d, i) => {
          let y = padT + plotH
          return categories.map(cat => {
            const v = d.values[cat] || 0
            if (v === 0) return null
            const h = (v / yMax) * plotH
            y -= h
            const x = xPos(i)
            return (
              <rect key={`${d.month}-${cat}`}
                x={x} y={y} width={barW} height={h}
                fill={colorFor(cat)}
                onMouseEnter={() => setHover({
                  month: d.month, cat, v,
                  x: x + barW / 2, y: y + h / 2,
                })}
                onMouseLeave={() => setHover(null)}
                onClick={() => onClickCategory?.(cat)}
                style={{ cursor: onClickCategory ? 'pointer' : 'default' }}
              />
            )
          })
        })}

        {/* x labels */}
        {months.map((m, i) => (
          <text key={m} x={xPos(i) + barW / 2} y={height - 8}
                textAnchor="middle"
                style={{ fontSize: 10, fill: 'var(--muted)' }}
                fontFamily="JetBrains Mono">
            {fmtMonth(m)}
          </text>
        ))}

        {/* Legend */}
        <g transform={`translate(${padL + plotW + 14}, ${padT})`}>
          {categories.slice().reverse().map((c, i) => {
            const total = data.reduce((s, d) => s + (d.values[c] || 0), 0)
            return (
              <g key={c} transform={`translate(0, ${i * 16})`}
                 style={{ cursor: onClickCategory ? 'pointer' : 'default' }}
                 onClick={() => onClickCategory?.(c)}>
                <rect width={9} height={9} fill={colorFor(c)} y={2} />
                <text x={14} y={11} style={{ fontSize: 11, fill: 'var(--ink-soft)' }}>{c}</text>
                <text x={legendW - 22} y={11} textAnchor="end"
                      style={{ fontSize: 10, fill: 'var(--muted)' }}
                      fontFamily="JetBrains Mono">
                  {compactMoney(total)}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {hover && (
        <div style={{
          position: 'absolute',
          left: Math.min(Math.max(hover.x, 80), w - 160),
          top: hover.y - 10,
          transform: 'translate(-50%, -100%)',
          background: 'var(--ink)', color: 'var(--paper)',
          padding: '6px 9px', fontSize: 11, borderRadius: 3,
          pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10,
        }}>
          <div style={{ fontWeight: 500 }}>{hover.cat}</div>
          <div className="num" style={{ opacity: 0.75 }}>{fmtMonth(hover.month)} · {fmtMoney(hover.v)}</div>
        </div>
      )}
    </div>
  )
}

function Empty() {
  return <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
    No data in selected range
  </div>
}

function niceStep(raw: number): number {
  if (raw <= 0) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  let step = 1
  if (norm < 1.5) step = 1
  else if (norm < 3) step = 2
  else if (norm < 7) step = 5
  else step = 10
  return step * mag
}

function compactMoney(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`
  return `$${Math.round(v)}`
}
