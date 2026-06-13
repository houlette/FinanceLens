import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { Card, Stat } from '../components/Card'
import { HBar } from '../charts/HBar'
import { fmtMoney, fmtDate, colorFor } from '../utils'
import type { RecurringSeries } from '../types'

type Bucket = 'bills' | 'income' | 'transfers'

const BUCKET_LABELS: Record<Bucket, string> = {
  bills: 'Bills & subscriptions',
  income: 'Income',
  transfers: 'Savings & transfers',
}

export default function RecurringView() {
  const [bucket, setBucket] = useState<Bucket>('bills')
  const [showEnded, setShowEnded] = useState(false)
  const q = useQuery({ queryKey: ['recurring'], queryFn: api.recurring })

  const series = q.data?.series ?? []
  const summary = q.data?.summary

  const counts = useMemo(() => {
    const c: Record<Bucket, { active: number; ended: number }> = {
      bills: { active: 0, ended: 0 }, income: { active: 0, ended: 0 }, transfers: { active: 0, ended: 0 },
    }
    for (const s of series) c[s.bucket][s.status === 'active' ? 'active' : 'ended']++
    return c
  }, [series])

  const visible = series.filter(s =>
    s.bucket === bucket && (showEnded || s.status === 'active'))

  const upcoming = useMemo(() => {
    if (!q.data?.asof) return []
    const horizon = new Date(q.data.asof + 'T00:00:00')
    horizon.setDate(horizon.getDate() + 45)
    const lim = horizon.toISOString().slice(0, 10)
    return series
      .filter(s => s.bucket === 'bills' && s.next_expected && s.next_expected <= lim)
      .sort((a, b) => a.next_expected!.localeCompare(b.next_expected!))
      .slice(0, 14)
  }, [series, q.data?.asof])

  return (
    <div>
      <Header />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
        <Stat label="Monthly bills" value={fmtMoney(summary?.bills_monthly)}
              sub={summary ? `${summary.bills_count} active series, normalized to per-month` : ' '} />
        <Stat label="Recurring income" value={fmtMoney(summary?.income_monthly)}
              sub="per month, detected from deposits" color="var(--pos)" />
        <Stat label="Savings & transfers" value={fmtMoney(summary?.transfers_monthly)}
              sub="per month, recurring movements" />
        <Stat label="Recently ended" value={summary?.ended_recent ?? '—'}
              sub="bills that stopped in the last 120 days" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr', gap: 18, alignItems: 'start' }}>
        <Card
          title="Recurring series"
          eyebrow={q.data?.asof ? `Detected from full history · data through ${fmtDate(q.data.asof)}` : 'Detecting…'}
          action={
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={showEnded} onChange={e => setShowEnded(e.target.checked)} />
              Show ended
            </label>
          }>
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {(Object.keys(BUCKET_LABELS) as Bucket[]).map(b => (
              <button key={b} onClick={() => setBucket(b)} style={{
                padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                background: bucket === b ? 'var(--ink)' : 'transparent',
                color: bucket === b ? 'var(--paper)' : 'var(--muted)',
                border: '1px solid ' + (bucket === b ? 'var(--ink)' : 'var(--line)'),
                borderRadius: 2,
              }}>
                {BUCKET_LABELS[b]}
                <span style={{ marginLeft: 6, opacity: 0.65 }} className="num">
                  {counts[b].active}{showEnded && counts[b].ended ? `+${counts[b].ended}` : ''}
                </span>
              </button>
            ))}
          </div>

          {q.isLoading && <Empty text="Analyzing transaction history…" />}
          {!q.isLoading && visible.length === 0 && (
            <Empty text={showEnded ? 'Nothing recurring detected here.' : 'Nothing active. Try “Show ended”.'} />
          )}
          <div style={{ maxHeight: 'calc(100vh - 420px)', overflowY: 'auto' }}>
            {visible.map((s, i) => <SeriesRow key={s.key} s={s} first={i === 0} />)}
          </div>
        </Card>

        <div style={{ display: 'grid', gap: 18 }}>
          <Card title="Monthly cost by category" eyebrow="Active bills, normalized to per-month">
            <HBar items={(summary?.by_category ?? []).map(c => ({
              label: c.category, value: c.monthly, count: c.count,
            }))} />
          </Card>

          <Card title="Up next" eyebrow="Expected bills in the next 45 days">
            {upcoming.length === 0 && <Empty text="Nothing expected soon." />}
            {upcoming.map((s, i) => {
              const overdue = q.data?.asof != null && s.next_expected! < q.data.asof
              return (
              <div key={s.key} style={{
                display: 'grid', gridTemplateColumns: '86px 1fr auto', gap: 10,
                padding: '7px 0', fontSize: 12.5, alignItems: 'baseline',
                borderTop: i === 0 ? 'none' : '1px solid var(--line-soft)',
              }}>
                <span style={{ color: overdue ? 'var(--neg)' : 'var(--muted)' }}
                      title={overdue ? 'Expected before the newest imported data, but not seen' : undefined}>
                  {fmtDate(s.next_expected!)}
                </span>
                <span title={overdue ? `${s.merchant} — expected but not seen yet` : s.merchant}
                      style={{ color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.merchant}
                </span>
                <span className="num" style={{ color: 'var(--ink)' }}>
                  {s.amount_type === 'variable' ? '~' : ''}{fmtMoney(s.typical_amount, { cents: true })}
                </span>
              </div>
            )})}
          </Card>
        </div>
      </div>
    </div>
  )
}

function SeriesRow({ s, first }: { s: RecurringSeries; first: boolean }) {
  const [open, setOpen] = useState(false)
  const ended = s.status === 'ended'
  const approx = s.amount_type === 'variable' ? '~' : ''

  return (
    <div style={{ borderTop: first ? 'none' : '1px solid var(--line-soft)', opacity: ended ? 0.62 : 1 }}>
      <div onClick={() => setOpen(o => !o)} style={{
        display: 'grid', gridTemplateColumns: '14px 1fr 110px 120px', gap: 10,
        padding: '10px 0', cursor: 'pointer', alignItems: 'baseline',
      }}>
        <span style={{ width: 8, height: 8, background: colorFor(s.category), display: 'inline-block', alignSelf: 'center' }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.merchant}
            {ended && (
              <span className="mono" style={{
                marginLeft: 8, fontSize: 9, letterSpacing: '0.08em', padding: '2px 5px',
                border: '1px solid var(--line)', color: 'var(--muted)', verticalAlign: 'middle',
              }}>ENDED</span>
            )}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--muted-2)', marginTop: 2 }}>
            {s.category}
            {!ended && s.next_expected && <> · next ~{fmtDate(s.next_expected)}</>}
            {ended && <> · last {fmtDate(s.last_date)}</>}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          {s.cadence}
          <ConfidenceDot value={s.confidence} />
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="num" style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 500 }}>
            {approx}{fmtMoney(s.typical_amount, { cents: true })}
          </div>
          {s.cadence !== 'monthly' && (
            <div className="num" style={{ fontSize: 10.5, color: 'var(--muted-2)', marginTop: 2 }}>
              ≈ {fmtMoney(s.monthly_equivalent)}/mo
            </div>
          )}
        </div>
      </div>

      {open && (
        <div style={{ padding: '2px 0 12px 24px' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
            {s.count} occurrences · {fmtDate(s.first_date)} – {fmtDate(s.last_date)}
            {s.amount_type === 'variable' && <> · ranges {fmtMoney(s.amount_min, { cents: true })}–{fmtMoney(s.amount_max, { cents: true })}</>}
            {s.missed > 0 && <> · {s.missed} missed</>}
            {' '}· confidence {confidenceLabel(s.confidence)} ({s.confidence.toFixed(2)})
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
            gap: '3px 18px', maxHeight: 180, overflowY: 'auto',
          }}>
            {s.transactions.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--muted)' }}>
                <span>{fmtDate(t.date)}</span>
                <span className="num" style={{ color: 'var(--ink-soft)' }}>{fmtMoney(t.amount, { cents: true })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function confidenceLabel(v: number): string {
  return v >= 0.8 ? 'high' : v >= 0.65 ? 'medium' : 'low'
}

function ConfidenceDot({ value }: { value: number }) {
  const label = confidenceLabel(value)
  return (
    <span title={`Confidence: ${label} (${value.toFixed(2)})`} style={{
      display: 'inline-block', width: 5, height: 5, borderRadius: '50%', marginLeft: 7,
      verticalAlign: 'middle',
      background: label === 'high' ? 'var(--pos)' : label === 'medium' ? 'var(--muted)' : 'var(--neg)',
      opacity: 0.7,
    }} />
  )
}

function Empty({ text }: { text: string }) {
  return <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>{text}</div>
}

function Header() {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>05 · Recurring</div>
      <h1 className="serif" style={{ fontSize: 32, fontWeight: 400, color: 'var(--ink)', margin: 0, letterSpacing: '-0.015em' }}>
        What repeats
      </h1>
    </div>
  )
}
