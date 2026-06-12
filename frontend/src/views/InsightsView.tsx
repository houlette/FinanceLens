import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { Card } from '../components/Card'
import { FilterBar, defaultFilters, type Filters } from '../components/FilterBar'
import { fmtMoney, fmtMonth, fmtDate, colorFor, pct } from '../utils'

export default function InsightsView() {
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [threshold, setThreshold] = useState(200)
  const [hvThreshold, setHvThreshold] = useState(500)

  const now = new Date()
  const curQ = Math.floor(now.getMonth() / 3) + 1
  const [qYear, setQYear] = useState(now.getFullYear())
  const [quarter, setQuarter] = useState(curQ)

  const params = { start: filters.start, end: filters.end }

  const mom = useQuery({
    queryKey: ['mom', threshold, params],
    queryFn: () => api.momDeltas({ threshold, ...params }),
  })
  const hv = useQuery({
    queryKey: ['hv', hvThreshold, params],
    queryFn: () => api.highValue({ threshold: hvThreshold, ...params }),
  })
  const qc = useQuery({
    queryKey: ['qcompare', qYear, quarter],
    queryFn: () => api.quarterCompare(qYear, quarter),
  })

  return (
    <div>
      <Header />
      <FilterBar filters={filters} onChange={setFilters} />

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
        <Card title="Month-over-month changes"
              eyebrow={`Categories whose spending changed by ≥ $${threshold} vs prior month`}
              action={
                <NumberPicker label="Threshold" value={threshold} setValue={setThreshold} step={50} />
              }>
          <div style={{ maxHeight: 'calc(100vh - 330px)', overflowY: 'auto' }}>
            {(mom.data ?? []).length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                Nothing crossed the threshold.
              </div>
            )}
            {(mom.data ?? []).map((row, i) => (
              <div key={i} style={{
                padding: '14px 0', borderTop: i === 0 ? 'none' : '1px solid var(--line-soft)',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{
                    display: 'inline-block', width: 8, height: 8,
                    background: colorFor(row.category),
                  }} />
                  <span className="serif" style={{ fontSize: 16, color: 'var(--ink)' }}>
                    {row.category}
                  </span>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>· {fmtMonth(row.month)}</span>
                  <span className="num" style={{
                    marginLeft: 'auto',
                    color: row.delta > 0 ? 'var(--neg)' : 'var(--pos)',
                    fontSize: 14, fontWeight: 500,
                  }}>
                    {fmtMoney(row.delta, { signed: true })}
                  </span>
                  <span className="num" style={{ color: 'var(--muted-2)', fontSize: 11 }}>
                    (now {fmtMoney(row.current)})
                  </span>
                </div>
                {row.top_transactions.length > 0 && (
                  <div style={{ marginTop: 8, paddingLeft: 18 }}>
                    {row.top_transactions.map(t => (
                      <div key={t.id} style={{
                        display: 'grid', gridTemplateColumns: '90px 1fr 80px',
                        gap: 10, fontSize: 12, color: 'var(--muted)', padding: '3px 0',
                      }}>
                        <span>{fmtDate(t.date)}</span>
                        <span style={{ color: 'var(--ink-soft)' }}>{t.description}</span>
                        <span className="num" style={{ textAlign: 'right' }}>{fmtMoney(t.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card title="High-value transactions"
              eyebrow={`Spending over $${hvThreshold} (excluding Savings, Mortgages, Transfers)`}
              action={
                <NumberPicker label="≥ $" value={hvThreshold} setValue={setHvThreshold} step={100} />
              }>
          <div style={{ maxHeight: 'calc(100vh - 330px)', overflowY: 'auto' }}>
            {(hv.data ?? []).length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                None.
              </div>
            )}
            {(hv.data ?? []).map(t => (
              <div key={t.id} style={{
                display: 'grid', gridTemplateColumns: '78px 1fr auto',
                gap: 10, fontSize: 12.5, padding: '8px 0',
                borderTop: '1px solid var(--line-soft)', alignItems: 'baseline',
              }}>
                <span style={{ color: 'var(--muted)' }}>{fmtDate(t.date)}</span>
                <div>
                  <div style={{ color: 'var(--ink)' }}>{t.description}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted-2)', marginTop: 2 }}>{t.category}</div>
                </div>
                <span className="num" style={{ color: 'var(--ink)', fontWeight: 500 }}>{fmtMoney(t.amount)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Quarter-over-quarter"
            eyebrow={qc.data ? `${qc.data.current_label} vs ${qc.data.previous_label}` : ''}
            action={
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={qYear} onChange={e => setQYear(+e.target.value)} style={selectStyle}>
                  {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y =>
                    <option key={y}>{y}</option>)}
                </select>
                <select value={quarter} onChange={e => setQuarter(+e.target.value)} style={selectStyle}>
                  {[1, 2, 3, 4].map(q => <option key={q} value={q}>{`Q${q}`}</option>)}
                </select>
              </div>
            }
            style={{ marginTop: 18 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={th}>Category</th>
              <th style={{ ...th, textAlign: 'right' }}>{qc.data?.previous_label ?? 'Previous'}</th>
              <th style={{ ...th, textAlign: 'right' }}>{qc.data?.current_label ?? 'Current'}</th>
              <th style={{ ...th, textAlign: 'right' }}>Change</th>
              <th style={{ ...th, textAlign: 'right' }}>%</th>
            </tr>
          </thead>
          <tbody>
            {(qc.data?.rows ?? []).map(r => (
              <tr key={r.category} style={{ borderTop: '1px solid var(--line-soft)' }}>
                <td style={td}>{r.category}</td>
                <td style={{ ...td, textAlign: 'right' }} className="num">{fmtMoney(r.previous)}</td>
                <td style={{ ...td, textAlign: 'right' }} className="num">{fmtMoney(r.current)}</td>
                <td style={{ ...td, textAlign: 'right' }} className="num">
                  <span style={{ color: r.change > 0 ? 'var(--neg)' : r.change < 0 ? 'var(--pos)' : 'var(--muted)' }}>
                    {fmtMoney(r.change, { signed: true })}
                  </span>
                </td>
                <td style={{ ...td, textAlign: 'right', color: 'var(--muted)' }} className="num">
                  {r.pct_change == null ? 'new' : pct(r.pct_change, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function NumberPicker({ label, value, setValue, step }: {
  label: string; value: number; setValue: (v: number) => void; step: number
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span className="eyebrow">{label}</span>
      <input type="number" value={value} onChange={e => setValue(+e.target.value || 0)}
             step={step} min={0}
             style={{
               width: 80, padding: '4px 6px', fontSize: 12, fontFamily: 'inherit',
               background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 2,
               color: 'var(--ink)',
             }} />
    </div>
  )
}

const th = { padding: '8px 10px', fontWeight: 500, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em' } as const
const td = { padding: '6px 10px' }
const selectStyle = {
  padding: '4px 8px', fontSize: 12, fontFamily: 'inherit', color: 'var(--ink)',
  background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 2,
} as const

function Header() {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>04 · Insights</div>
      <h1 className="serif" style={{ fontSize: 32, fontWeight: 400, color: 'var(--ink)', margin: 0, letterSpacing: '-0.015em' }}>
        What changed
      </h1>
    </div>
  )
}
