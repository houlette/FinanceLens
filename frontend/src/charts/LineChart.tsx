import { useRef, useState, useEffect } from 'react'
import { fmtMonth, fmtMoney } from '../utils'

export interface LinePoint { x: string; y: number }

export function LineChart({ data, height = 220, color = 'var(--accent)' }: {
  data: LinePoint[]; height?: number; color?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(640)
  const [hover, setHover] = useState<{ i: number } | null>(null)

  useEffect(() => {
    const measure = () => { if (ref.current) setW(ref.current.clientWidth) }
    measure()
    const ro = new ResizeObserver(measure)
    if (ref.current) ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])

  if (!data.length) return <div style={{ padding: 30, color: 'var(--muted)', fontSize: 13, textAlign: 'center' }}>No data</div>

  const padL = 48, padR = 16, padT = 14, padB = 28
  const plotW = w - padL - padR
  const plotH = height - padT - padB

  const yMax = Math.max(...data.map(d => d.y), 1) * 1.05
  const yMin = 0
  const yTickStep = niceStep((yMax - yMin) / 4)
  const yTicks: number[] = []
  for (let v = 0; v <= yMax; v += yTickStep) yTicks.push(v)

  const xPos = (i: number) => padL + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW)
  const yPos = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin)) * plotH

  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xPos(i)},${yPos(d.y)}`).join(' ')
  const area = path + ` L${xPos(data.length - 1)},${padT + plotH} L${xPos(0)},${padT + plotH} Z`

  return (
    <div ref={ref} style={{ width: '100%', position: 'relative' }}>
      <svg width={w} height={height}
           onMouseLeave={() => setHover(null)}
           onMouseMove={e => {
             const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
             const xRel = e.clientX - r.left - padL
             const i = Math.max(0, Math.min(data.length - 1,
               Math.round((xRel / plotW) * (data.length - 1))))
             setHover({ i })
           }}>
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

        <path d={area} fill={color} fillOpacity={0.10} />
        <path d={path} fill="none" stroke={color} strokeWidth={1.6}
              strokeLinejoin="round" strokeLinecap="round" />

        {data.map((d, i) => (
          <circle key={i} cx={xPos(i)} cy={yPos(d.y)} r={2.5} fill={color} />
        ))}

        {data.map((d, i) => (
          // x label every other one if too many
          (data.length <= 12 || i % 2 === 0) && (
            <text key={d.x} x={xPos(i)} y={height - 8} textAnchor="middle"
                  style={{ fontSize: 10, fill: 'var(--muted)' }} fontFamily="JetBrains Mono">
              {fmtMonth(d.x)}
            </text>
          )
        ))}

        {hover && (
          <line x1={xPos(hover.i)} x2={xPos(hover.i)} y1={padT} y2={padT + plotH}
                stroke="var(--ink)" strokeWidth={0.5} strokeDasharray="2 2" />
        )}
      </svg>

      {hover && (() => {
        const d = data[hover.i]
        return (
          <div style={{
            position: 'absolute', left: xPos(hover.i),
            top: 8, transform: 'translate(-50%, 0)',
            background: 'var(--ink)', color: 'var(--paper)',
            padding: '5px 8px', fontSize: 11, borderRadius: 3,
            pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10,
          }}>
            <span>{fmtMonth(d.x)}</span>
            <span className="num" style={{ marginLeft: 8 }}>{fmtMoney(d.y)}</span>
          </div>
        )
      })()}
    </div>
  )
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
