import { useMemo, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { Card } from '../components/Card'
import { FilterBar, defaultFilters, type Filters } from '../components/FilterBar'
import { LineChart } from '../charts/LineChart'
import { HBar } from '../charts/HBar'
import { fmtMoney, fmtDate, colorFor } from '../utils'

export default function CategoriesView({ initialCategory }: { initialCategory?: string }) {
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [selected, setSelected] = useState<string | null>(initialCategory ?? null)

  useEffect(() => {
    if (initialCategory) setSelected(initialCategory)
  }, [initialCategory])

  const params = { start: filters.start, end: filters.end }
  const cats = useQuery({ queryKey: ['byCat', params], queryFn: () => api.byCategory(params) })

  useEffect(() => {
    if (!selected && cats.data && cats.data.length) setSelected(cats.data[0].category)
  }, [cats.data, selected])

  const monthly = useQuery({ queryKey: ['monthly', params], queryFn: () => api.monthly(params) })
  const merchants = useQuery({
    queryKey: ['byMerchant', selected, params],
    queryFn: () => api.byMerchant({ ...params, category: selected ?? undefined, limit: 20 }),
    enabled: !!selected,
  })
  const txns = useQuery({
    queryKey: ['txns', selected, params],
    queryFn: () => api.transactions({ ...params, category: selected ?? undefined, limit: 200 }),
    enabled: !!selected,
  })

  const trend = useMemo(() => {
    if (!monthly.data || !selected) return []
    return monthly.data.months.map(m => {
      const row = monthly.data.data.find(d => d.month === m)
      return { x: m, y: row?.values[selected] || 0 }
    })
  }, [monthly.data, selected])

  return (
    <div>
      <Header />
      <FilterBar filters={filters} onChange={setFilters} />

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 18 }}>
        {/* Sidebar list */}
        <Card padding={12}>
          <div className="eyebrow" style={{ padding: '4px 8px 10px' }}>Categories</div>
          <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
            {(cats.data ?? []).map(c => (
              <button key={c.category} onClick={() => setSelected(c.category)} style={{
                width: '100%', textAlign: 'left', padding: '8px 10px',
                background: selected === c.category ? 'var(--surface)' : 'transparent',
                border: 'none', borderLeft: `3px solid ${selected === c.category ? colorFor(c.category) : 'transparent'}`,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', justifyContent: 'space-between', gap: 8,
                color: 'var(--ink)',
              }}>
                <span style={{ fontSize: 13 }}>{c.category}</span>
                <span className="num" style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtMoney(c.total)}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* Detail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {selected ? (
            <>
              <Card title={selected} eyebrow="Spending trend">
                <LineChart data={trend} color={colorFor(selected)} />
              </Card>

              <Card title="Top merchants">
                <HBar items={(merchants.data ?? []).map(m => ({
                  label: m.merchant || '(unspecified)', value: m.total, count: m.count,
                }))} />
              </Card>

              <Card title={`Transactions (${txns.data?.length ?? 0})`}>
                <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                        <th style={th}>Date</th>
                        <th style={th}>Description</th>
                        <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(txns.data ?? []).map(t => (
                        <tr key={t.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                          <td style={{ ...td, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDate(t.date)}</td>
                          <td style={td}>{t.description}</td>
                          <td style={{ ...td, textAlign: 'right' }} className="num">{fmtMoney(t.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          ) : (
            <Card><div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)' }}>Pick a category</div></Card>
          )}
        </div>
      </div>
    </div>
  )
}

const th = { padding: '8px 10px', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' } as const
const td = { padding: '7px 10px', verticalAlign: 'top' as const }

function Header() {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>02 · Categories</div>
      <h1 className="serif" style={{ fontSize: 32, fontWeight: 400, color: 'var(--ink)', margin: 0, letterSpacing: '-0.015em' }}>
        Drill into a category
      </h1>
    </div>
  )
}
