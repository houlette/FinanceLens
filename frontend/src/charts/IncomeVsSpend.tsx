import { useRef, useState, useEffect } from 'react'
import { fmtMonth, fmtMoney } from '../utils'
import type { IncomeVsSpendRow } from '../types'

export function IncomeVsSpend({ data, height = 260 }: { data: IncomeVsSpendRow[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(640)
  const [hover, setHover] = useState<{ i: number; x: number } | null>(null)

  useEffect(() => {
    const measure = () => { if (ref.current) setW(ref.current.clientWidth) }
    measure()
    const ro = new ResizeObserver(measure)
    if (ref.current) ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])

  if (!data.length) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No data</div>

  const padL = 48, padR = 16, padT = 12, padB = 28
  const plotW = w - padL - padR
  const plotH = height - padT - padB

  const yMax = Math.max(...data.map(d => Math.max(d.spend, d.income)), 1) * 1.05
  const yTickStep = niceStep(yMax / 5)
  const yTicks: number[] = []
  for (let v = 0; v <= yMax; v += yTickStep) yTicks.push(v)

  const groupGap = 6, barGap = 2
  const groupW = (plotW - groupGap * (data.length - 1)) / data.length
  const barW = (groupW - barGap) / 2
  const groupX = (i: number) => padL + i * (groupW + groupGap)
  const yPos = (v: number) => padT + (1 - v / yMax) * plotH

  // Rolling 3-month average
  const rolling = (key: 'spend' | 'income') => data.map((_, i) => {
    const s = Math.max(0, i - 2)
    const vals = data.slice(s, i + 1).map(d => d[key])
    return vals.reduce((a, b) => a + b, 0) / vals.length
  })
  const rollSpend = rolling('spend')
  const rollIncome = rolling('income')

  const pathFor = (vals: number[]) => vals.map((v, i) =>
    `${i === 0 ? 'M' : 'L'}${groupX(i) + groupW / 2},${yPos(v)}`).join(' ')

  return (
    <div ref={ref} style={{ width: '100%', position: 'relative' }}>
      <svg width={w} height={height}>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={padL + plotW} y1={yPos(t)} y2={yPos(t)}
                  stroke="var(--line-soft)" strokeWidth={0.5} />
            <text x={padL - 6} y={yPos(t) + 3} textAnchor="end"
                  style={{ fontSize: 10, fill: 'var(--muted)' }} fontFamily="JetBrains Mono">
              {compactMoney(t)}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const gx = groupX(i)
          const ys = yPos(d.spend)
          const yi = yPos(d.income)
          return (
            <g key={d.month}
               onMouseEnter={() => setHover({ i, x: gx + groupW / 2 })}
               onMouseLeave={() => setHover(null)}>
              <rect x={gx} y={ys} width={barW} height={padT + plotH - ys}
                    fill="var(--accent)" opacity={0.85} />
              <rect x={gx + barW + barGap} y={yi} width={barW} height={padT + plotH - yi}
                    fill="var(--accent-2)" opacity={0.85} />
              <text x={gx + groupW / 2} y={height - 8}
                    textAnchor="middle" style={{ fontSize: 10, fill: 'var(--muted)' }}
                    fontFamily="JetBrains Mono">{fmtMonth(d.month)}</text>
            </g>
          )
        })}

        <path d={pathFor(rollSpend)} fill="none" stroke="var(--accent)"
              strokeWidth={1.5} strokeDasharray="2 3" />
        <path d={pathFor(rollIncome)} fill="none" stroke="var(--accent-2)"
              strokeWidth={1.5} strokeDasharray="2 3" />
      </svg>

      <Legend />

      {hover && (() => {
        const d = data[hover.i]
        return (
          <div style={{
            position: 'absolute', left: Math.min(Math.max(hover.x, 100), w - 140),
            top: 10, transform: 'translate(-50%, 0)',
            background: 'var(--ink)', color: 'var(--paper)',
            padding: '6px 9px', fontSize: 11, borderRadius: 3,
            pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10,
          }}>
            <div style={{ fontWeight: 500 }}>{fmtMonth(d.month)}</div>
            <div className="num" style={{ opacity: 0.85 }}>spend {fmtMoney(d.spend)}</div>
            <div className="num" style={{ opacity: 0.85 }}>income {fmtMoney(d.income)}</div>
            <div className="num" style={{ opacity: 0.85 }}>net {fmtMoney(d.income - d.spend, { signed: true })}</div>
          </div>
        )
      })()}
    </div>
  )
}

function Legend() {
  return (
    <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--muted)', marginTop: 8, paddingLeft: 48 }}>
      <Pip color="var(--accent)" label="Spending" />
      <Pip color="var(--accent-2)" label="Income" />
      <span style={{ marginLeft: 'auto' }}>
        <span style={{ color: 'var(--muted-2)' }}>dashed = 3-mo rolling avg</span>
      </span>
    </div>
  )
}

function Pip({ color, label }: { color: string; label: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
    <span style={{ display: 'inline-block', width: 10, height: 10, background: color }} />
    {label}
  </span>
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
