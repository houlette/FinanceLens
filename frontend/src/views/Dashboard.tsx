import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { Card, Stat } from '../components/Card'
import { FilterBar, defaultFilters, type Filters } from '../components/FilterBar'
import { StackedBar } from '../charts/StackedBar'
import { IncomeVsSpend } from '../charts/IncomeVsSpend'
import { HBar } from '../charts/HBar'
import { Sparkline } from '../charts/Sparkline'
import { fmtMoney, pct } from '../utils'

type Mode = 'all' | 'top' | 'movers'

export default function Dashboard({ onPickCategory }: { onPickCategory?: (c: string) => void }) {
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [mode, setMode] = useState<Mode>('top')

  const params = { start: filters.start, end: filters.end }

  const kpis = useQuery({ queryKey: ['kpis', params], queryFn: () => api.kpis(params) })
  const monthly = useQuery({ queryKey: ['monthly', params], queryFn: () => api.monthly(params) })
  const ivs = useQuery({ queryKey: ['ivs', params], queryFn: () => api.incomeVsSpend(params) })
  const byCat = useQuery({ queryKey: ['byCat', params], queryFn: () => api.byCategory(params) })

  // Derive selected categories based on mode
  const filteredMonthly = useMemo(() => {
    if (!monthly.data) return null
    const { months, categories, data } = monthly.data
    let cats = categories
    if (mode === 'top') {
      const totals = categories.map(c => ({
        c, total: data.reduce((s, m) => s + (m.values[c] || 0), 0),
      }))
      cats = totals.sort((a, b) => b.total - a.total).slice(0, 10).map(t => t.c)
    } else if (mode === 'movers') {
      const totalsByMonth: Record<string, Record<string, number>> = Object.fromEntries(
        data.map(m => [m.month, m.values]),
      )
      const sortedMonths = [...months].sort()
      const moverSet = new Set<string>()
      for (const c of categories) {
        let prev: number | null = null
        let maxAbsDelta = 0
        for (const m of sortedMonths) {
          const v = totalsByMonth[m]?.[c] || 0
          if (prev != null) maxAbsDelta = Math.max(maxAbsDelta, Math.abs(v - prev))
          prev = v
        }
        if (maxAbsDelta > 200) moverSet.add(c)
      }
      cats = categories.filter(c => moverSet.has(c))
    }
    return { months, categories: cats, data }
  }, [monthly.data, mode])

  const ivsData = ivs.data ?? []
  const spendSpark = ivsData.map(d => d.spend)
  const incomeSpark = ivsData.map(d => d.income)

  const savingsRate = kpis.data && kpis.data.income
    ? (kpis.data.savings / kpis.data.income) * 100
    : null
  const netRate = kpis.data && kpis.data.income
    ? ((kpis.data.income - kpis.data.spend - kpis.data.savings) / kpis.data.income) * 100
    : null

  return (
    <div>
      <Header />
      <FilterBar filters={filters} onChange={setFilters} />

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        <Stat label="Income" value={fmtMoney(kpis.data?.income)}
              sub={<Sparkline values={incomeSpark} color="var(--accent-2)" />}
              color="var(--accent-2)" />
        <Stat label="Spending" value={fmtMoney(kpis.data?.spend)}
              sub={<Sparkline values={spendSpark} color="var(--accent)" />}
              color="var(--accent)" />
        <Stat label="Savings" value={fmtMoney(kpis.data?.savings)}
              sub={savingsRate != null ? `${pct(savingsRate, 1)} of income` : ''}
              color="var(--accent-3)" />
        <Stat label="Net" value={fmtMoney(kpis.data?.net, { signed: true })}
              sub={netRate != null ? `${pct(netRate, 1)} of income` : ''}
              color={(kpis.data?.net ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)'} />
      </div>

      {/* Monthly stacked */}
      <Card title="Monthly spending by category"
            action={<ModeToggle mode={mode} setMode={setMode} />}
            style={{ marginBottom: 20 }}>
        {filteredMonthly && <StackedBar
          months={filteredMonthly.months}
          categories={filteredMonthly.categories}
          data={filteredMonthly.data}
          onClickCategory={onPickCategory}
        />}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
        <Card title="Income vs spending">
          <IncomeVsSpend data={ivsData} />
        </Card>
        <Card title="Top categories">
          <HBar items={(byCat.data ?? []).slice(0, 10).map(c => ({
            label: c.category, value: c.total, count: c.count,
          }))} onClick={onPickCategory} />
        </Card>
      </div>
    </div>
  )
}

function Header() {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>01 · Dashboard</div>
      <h1 className="serif" style={{ fontSize: 32, fontWeight: 400, color: 'var(--ink)', margin: 0, letterSpacing: '-0.015em' }}>
        Money, at a glance
      </h1>
    </div>
  )
}

function ModeToggle({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const opts: { id: Mode; label: string }[] = [
    { id: 'top', label: 'Top 10' },
    { id: 'movers', label: 'Big movers' },
    { id: 'all', label: 'All' },
  ]
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {opts.map(o => (
        <button key={o.id} onClick={() => setMode(o.id)} style={{
          padding: '4px 10px', fontSize: 11, cursor: 'pointer',
          background: mode === o.id ? 'var(--ink)' : 'transparent',
          color: mode === o.id ? 'var(--paper)' : 'var(--muted)',
          border: '1px solid ' + (mode === o.id ? 'var(--ink)' : 'var(--line)'),
          borderRadius: 2, fontFamily: 'inherit',
        }}>{o.label}</button>
      ))}
    </div>
  )
}
