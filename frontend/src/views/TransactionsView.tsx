import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { Card } from '../components/Card'
import { FilterBar, defaultFilters, type Filters } from '../components/FilterBar'
import { fmtMoney, fmtDate } from '../utils'
import type { Transaction } from '../types'

export default function TransactionsView() {
  const qc = useQueryClient()
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [editing, setEditing] = useState<{ id: number; field: 'description' | 'category'; value: string } | null>(null)

  const params = {
    start: filters.start, end: filters.end,
    q: search || undefined,
    category: category || undefined,
    limit: 1000,
  }
  const txns = useQuery({ queryKey: ['txnList', params], queryFn: () => api.transactions(params) })
  const cats = useQuery({ queryKey: ['allCategories'], queryFn: () => api.categories() })

  const patch = useMutation({
    mutationFn: ({ id, ...p }: { id: number; category?: string; description?: string }) =>
      api.patchTransaction(id, p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['txnList'] })
      qc.invalidateQueries({ queryKey: ['kpis'] })
      qc.invalidateQueries({ queryKey: ['monthly'] })
      qc.invalidateQueries({ queryKey: ['byCat'] })
    },
  })

  const commit = () => {
    if (!editing) return
    patch.mutate({ id: editing.id, [editing.field]: editing.value })
    setEditing(null)
  }

  return (
    <div>
      <Header count={txns.data?.length ?? 0} />
      <FilterBar filters={filters} onChange={setFilters} />

      <Card padding={0}>
        <div style={{
          display: 'flex', gap: 10, padding: '12px 14px',
          borderBottom: '1px solid var(--line)', alignItems: 'center', flexWrap: 'wrap',
        }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
                 placeholder="Search description…"
                 style={inputStyle} />
          <select value={category} onChange={e => setCategory(e.target.value)} style={selectStyle}>
            <option value="">All categories</option>
            {(cats.data ?? []).map(c => <option key={c}>{c}</option>)}
          </select>
          <div style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--muted)' }}>
            Click a category or description to edit. Edits mark the row as user-overridden.
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)', background: 'var(--surface)' }}>
                <th style={th}>Date</th>
                <th style={th}>Description</th>
                <th style={th}>Category</th>
                <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {(txns.data ?? []).map(t => (
                <Row key={t.id} t={t} editing={editing} setEditing={setEditing}
                     commit={commit} categories={cats.data ?? []} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function Row({ t, editing, setEditing, commit, categories }: {
  t: Transaction
  editing: { id: number; field: 'description' | 'category'; value: string } | null
  setEditing: (e: typeof editing) => void
  commit: () => void
  categories: string[]
}) {
  const isEdit = (field: 'description' | 'category') =>
    editing && editing.id === t.id && editing.field === field

  return (
    <tr style={{
      borderTop: '1px solid var(--line-soft)',
      background: t.user_overridden ? 'color-mix(in srgb, var(--hi) 6%, transparent)' : undefined,
    }}>
      <td style={{ ...td, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDate(t.date)}</td>
      <td style={td} onClick={() => setEditing({ id: t.id, field: 'description', value: t.description })}>
        {isEdit('description') ? (
          <input autoFocus value={editing!.value}
                 onChange={e => setEditing({ ...editing!, value: e.target.value })}
                 onBlur={commit}
                 onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(null) }}
                 style={editInputStyle} />
        ) : (
          <span style={{ cursor: 'pointer' }}>{t.description}</span>
        )}
        {t.description !== t.description_raw && (
          <div style={{ fontSize: 10.5, color: 'var(--muted-2)', marginTop: 2 }}>
            raw: {t.description_raw}
          </div>
        )}
      </td>
      <td style={td} onClick={() => setEditing({ id: t.id, field: 'category', value: t.category })}>
        {isEdit('category') ? (
          <select autoFocus value={editing!.value}
                  onChange={e => setEditing({ ...editing!, value: e.target.value })}
                  onBlur={commit}
                  style={editInputStyle}>
            {[t.category, ...categories.filter(c => c !== t.category)].map(c => <option key={c}>{c}</option>)}
          </select>
        ) : (
          <span style={{
            cursor: 'pointer', padding: '2px 8px', fontSize: 11.5,
            background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 2,
          }}>{t.category}</span>
        )}
      </td>
      <td style={{ ...td, textAlign: 'right' }} className="num">
        <span style={{ color: t.amount < 0 ? 'var(--pos)' : 'var(--ink)' }}>
          {fmtMoney(t.amount, { cents: true })}
        </span>
      </td>
      <td style={td}>
        {t.user_overridden && (
          <span title="Manually edited"
                style={{ fontSize: 10, color: 'var(--hi)', letterSpacing: '0.04em' }}>
            ✎
          </span>
        )}
      </td>
    </tr>
  )
}

const th = { padding: '10px 12px', fontWeight: 500, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em' } as const
const td = { padding: '8px 12px', verticalAlign: 'top' as const }
const inputStyle = {
  padding: '5px 10px', fontSize: 12.5, background: 'var(--surface)',
  border: '1px solid var(--line)', borderRadius: 2, fontFamily: 'inherit',
  color: 'var(--ink)', minWidth: 220,
} as const
const selectStyle = { ...inputStyle, minWidth: 160 }
const editInputStyle = {
  padding: '3px 6px', fontSize: 12.5, background: 'var(--paper)',
  border: '1px solid var(--accent-2)', borderRadius: 2, fontFamily: 'inherit',
  color: 'var(--ink)', width: '100%',
} as const

function Header({ count }: { count: number }) {
  return (
    <div style={{ marginBottom: 18, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>03 · Transactions</div>
        <h1 className="serif" style={{ fontSize: 32, fontWeight: 400, color: 'var(--ink)', margin: 0, letterSpacing: '-0.015em' }}>
          Every line item
        </h1>
      </div>
      <div className="num" style={{ fontSize: 12, color: 'var(--muted)' }}>{count.toLocaleString()} rows</div>
    </div>
  )
}
