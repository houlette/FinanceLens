import { useRef, useState, useEffect } from 'react'

export function Sparkline({ values, height = 28, color = 'var(--ink)', area = true }: {
  values: (number | null | undefined)[]
  height?: number
  color?: string
  area?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(120)

  useEffect(() => {
    const measure = () => { if (ref.current) setW(ref.current.clientWidth) }
    measure()
    const ro = new ResizeObserver(measure)
    if (ref.current) ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])

  if (!values?.length) return <div ref={ref} style={{ width: '100%', height }} />
  const valid = values.filter((v): v is number => v != null && !isNaN(v))
  if (!valid.length) return <div ref={ref} style={{ width: '100%', height }} />

  const min = Math.min(...valid, 0)
  const max = Math.max(...valid)
  const range = (max - min) || 1
  const Y = (v: number) => (1 - (v - min) / range) * (height - 4) + 2

  let path = '', areaPath = ''
  let started = false
  values.forEach((v, i) => {
    if (v == null) return
    const x = (i / (values.length - 1)) * (w - 2) + 1
    const y = Y(v)
    if (!started) {
      path += `M${x},${y}`
      areaPath += `M${x},${height}L${x},${y}`
      started = true
    } else {
      path += `L${x},${y}`
      areaPath += `L${x},${y}`
    }
  })
  areaPath += `L${w - 1},${height}Z`

  return (
    <div ref={ref} style={{ width: '100%', height }}>
      <svg width={w} height={height} style={{ display: 'block' }}>
        {area && <path d={areaPath} fill={color} fillOpacity={0.12} />}
        <path d={path} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  )
}
