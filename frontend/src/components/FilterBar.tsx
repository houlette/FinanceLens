import { useState } from 'react'

export interface Filters {
  start: string  // YYYY-MM-DD
  end: string    // YYYY-MM-DD
}

const PRESETS: { id: string; label: string; months: number }[] = [
  { id: '3m',  label: '3 mo',   months: 3 },
  { id: '6m',  label: '6 mo',   months: 6 },
  { id: '12m', label: '12 mo',  months: 12 },
  { id: 'ytd', label: 'YTD',    months: 0 },
  { id: 'all', label: 'All',    months: -1 },
]

function applyPreset(id: string): Filters {
  const today = new Date()
  const end = today.toISOString().slice(0, 10)
  if (id === 'all') return { start: '', end: '' }
  if (id === 'ytd') {
    return { start: `${today.getFullYear()}-01-01`, end }
  }
  const months = PRESETS.find(p => p.id === id)!.months
  const d = new Date(today)
  d.setMonth(d.getMonth() - months)
  return { start: d.toISOString().slice(0, 10), end }
}

export function FilterBar({ filters, onChange }: {
  filters: Filters
  onChange: (f: Filters) => void
}) {
  const [activePreset, setActivePreset] = useState<string | null>('12m')

  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
      padding: '14px 18px', background: 'var(--paper)',
      border: '1px solid var(--line)', borderRadius: 4, marginBottom: 20,
    }}>
      <div className="eyebrow">Range</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {PRESETS.map(p => (
          <button key={p.id} onClick={() => {
            setActivePreset(p.id); onChange(applyPreset(p.id))
          }} style={{
            padding: '5px 10px', fontSize: 12, cursor: 'pointer',
            background: activePreset === p.id ? 'var(--ink)' : 'transparent',
            color: activePreset === p.id ? 'var(--paper)' : 'var(--muted)',
            border: '1px solid ' + (activePreset === p.id ? 'var(--ink)' : 'var(--line)'),
            borderRadius: 2, fontFamily: 'inherit',
          }}>{p.label}</button>
        ))}
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
        <div className="eyebrow">From</div>
        <input type="date" value={filters.start} onChange={e => {
          setActivePreset(null); onChange({ ...filters, start: e.target.value })
        }} style={inputStyle} />
        <div className="eyebrow">To</div>
        <input type="date" value={filters.end} onChange={e => {
          setActivePreset(null); onChange({ ...filters, end: e.target.value })
        }} style={inputStyle} />
      </div>
    </div>
  )
}

const inputStyle = {
  padding: '5px 8px', fontSize: 12, color: 'var(--ink)',
  background: 'var(--surface)', border: '1px solid var(--line)',
  borderRadius: 2, fontFamily: 'inherit',
} as const

export const defaultFilters = (): Filters => applyPreset('12m')
