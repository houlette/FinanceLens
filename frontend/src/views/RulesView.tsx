import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { Card } from '../components/Card'
import { fmtMoney, fmtDate } from '../utils'
import type { RuleSuggestion } from '../types'

// Categories the bank reliably gets right on its own — hidden from the
// triage queue by default so spending merchants surface first.
const TRIAGE_HIDDEN_CATS = new Set([
  'Transfers', 'Payment/Credit', 'Deposits', 'Paychecks/Salary', 'Payroll',
  'Interest', 'Other Income', 'Expense Reimbursement',
  'Awards and Rebate Credits', 'Rewards',
])

export default function RulesView() {
  const qc = useQueryClient()
  const rules = useQuery({ queryKey: ['rules'], queryFn: api.listRules })
  const aliases = useQuery({ queryKey: ['aliases'], queryFn: api.listAliases })
  const cats = useQuery({ queryKey: ['allCategories'], queryFn: api.categories })
  const suggestions = useQuery({ queryKey: ['ruleSuggestions'], queryFn: api.ruleSuggestions })
  const [filter, setFilter] = useState('')
  const [reapplyMsg, setReapplyMsg] = useState<string | null>(null)

  const reapply = useMutation({
    mutationFn: api.reapplyRules,
    onSuccess: (r) => {
      setReapplyMsg(`Reapplied: ${r.updated} of ${r.examined} transactions updated.`)
      qc.invalidateQueries()
    },
  })

  const createRule = useMutation({
    mutationFn: api.createRule,
    onSuccess: () => qc.invalidateQueries(),
  })

  // Triage flow: create the rule, then re-apply so existing transactions
  // pick it up and the queue refreshes without the matched group.
  const addRuleAndApply = useMutation({
    mutationFn: async (r: { merchant_pattern: string; category: string }) => {
      await api.createRule(r)
      return api.reapplyRules()
    },
    onSuccess: () => qc.invalidateQueries(),
  })
  const updateRule = useMutation({
    mutationFn: ({ id, ...p }: { id: number; category?: string; merchant_pattern?: string; active?: boolean }) =>
      api.updateRule(id, p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  })
  const deleteRule = useMutation({
    mutationFn: api.deleteRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  })

  const createAlias = useMutation({
    mutationFn: api.createAlias,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['aliases'] }),
  })
  const deleteAlias = useMutation({
    mutationFn: api.deleteAlias,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['aliases'] }),
  })

  const filteredRules = (rules.data ?? []).filter(r =>
    !filter || r.merchant_pattern.toLowerCase().includes(filter.toLowerCase()) ||
    r.category.toLowerCase().includes(filter.toLowerCase()),
  )

  return (
    <div>
      <Header />

      <div style={{ display: 'flex', gap: 12, marginBottom: 18, alignItems: 'center' }}>
        <button onClick={() => { setReapplyMsg(null); reapply.mutate() }}
                disabled={reapply.isPending}
                style={primaryBtn}>
          {reapply.isPending ? 'Reapplying…' : 'Reapply rules to past transactions'}
        </button>
        {reapplyMsg && <div style={{ fontSize: 12.5, color: 'var(--pos)' }}>{reapplyMsg}</div>}
        <div style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>
          Manually edited rows (user-overridden) are skipped.
        </div>
      </div>

      <TriageQueue
        suggestions={suggestions.data ?? []}
        categories={cats.data ?? []}
        onAdd={(r) => addRuleAndApply.mutate(r)}
        busy={addRuleAndApply.isPending}
        pendingPattern={addRuleAndApply.isPending ? addRuleAndApply.variables?.merchant_pattern : undefined}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 18 }}>
        <Card title={`Category rules (${filteredRules.length})`} eyebrow="Merchant pattern → category"
              action={
                <input value={filter} onChange={e => setFilter(e.target.value)}
                       placeholder="Filter…" style={smallInputStyle} />
              }>
          <NewRuleForm onSubmit={(r) => createRule.mutate(r)} categories={cats.data ?? []} />
          <div style={{ maxHeight: 'calc(100vh - 360px)', overflowY: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={th}>Pattern</th>
                  <th style={th}>Category</th>
                  <th style={th}>Active</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {filteredRules.map(r => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                    <td style={td}>
                      <code style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{r.merchant_pattern}</code>
                    </td>
                    <td style={td}>
                      <select value={r.category}
                              onChange={e => updateRule.mutate({ id: r.id, category: e.target.value })}
                              style={smallSelectStyle}>
                        {[r.category, ...(cats.data ?? []).filter(c => c !== r.category)].map(c =>
                          <option key={c}>{c}</option>)}
                      </select>
                    </td>
                    <td style={td}>
                      <input type="checkbox" checked={r.active}
                             onChange={e => updateRule.mutate({ id: r.id, active: e.target.checked })} />
                    </td>
                    <td style={td}>
                      <button onClick={() => deleteRule.mutate(r.id)} style={iconBtn}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title={`Merchant aliases (${(aliases.data ?? []).length})`}
              eyebrow="Substring → canonical name">
          <NewAliasForm onSubmit={(a) => createAlias.mutate(a)} />
          <div style={{ maxHeight: 'calc(100vh - 360px)', overflowY: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={th}>Pattern</th>
                  <th style={th}>Canonical name</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {(aliases.data ?? []).map(a => (
                  <tr key={a.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                    <td style={td}><code style={{ fontSize: 12 }}>{a.pattern}</code></td>
                    <td style={td}>{a.canonical_name}</td>
                    <td style={td}>
                      <button onClick={() => deleteAlias.mutate(a.id)} style={iconBtn}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}

function TriageQueue({ suggestions, categories, onAdd, busy, pendingPattern }: {
  suggestions: RuleSuggestion[]
  categories: string[]
  onAdd: (r: { merchant_pattern: string; category: string }) => void
  busy: boolean
  pendingPattern?: string
}) {
  const [hideTransfers, setHideTransfers] = useState(true)
  const [sortBy, setSortBy] = useState<'count' | 'spend'>('count')
  const [showAll, setShowAll] = useState(false)

  const visible = suggestions.filter(s => !hideTransfers || !TRIAGE_HIDDEN_CATS.has(s.current_category))
  const sorted = [...visible].sort((a, b) =>
    sortBy === 'count' ? b.count - a.count || b.total_spend - a.total_spend
                       : b.total_spend - a.total_spend || b.count - a.count)
  const shown = showAll ? sorted : sorted.slice(0, 25)
  const txnCount = visible.reduce((n, s) => n + s.count, 0)

  return (
    <Card
      style={{ marginBottom: 18 }}
      title={`Needs a rule (${visible.length} merchants · ${txnCount.toLocaleString()} transactions)`}
      eyebrow="Riding on the bank's category guess — most frequent first"
      action={
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 12, color: 'var(--muted)' }}>
          <label style={{ display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={hideTransfers}
                   onChange={e => setHideTransfers(e.target.checked)} />
            Hide transfers & income
          </label>
          <span>
            Sort:{' '}
            <button onClick={() => setSortBy('count')} style={sortBy === 'count' ? sortOn : sortOff}>count</button>
            {' / '}
            <button onClick={() => setSortBy('spend')} style={sortBy === 'spend' ? sortOn : sortOff}>spend</button>
          </span>
        </div>
      }>
      <div style={{ maxHeight: 380, overflowY: 'auto', marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={{ ...th, textAlign: 'right' }}>Txns</th>
              <th style={{ ...th, textAlign: 'right' }}>Spend</th>
              <th style={th}>Last seen</th>
              <th style={th}>Merchant</th>
              <th style={th}>Rule pattern</th>
              <th style={th}>Category</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {shown.map(s => (
              <SuggestionRow key={s.description} s={s} categories={categories}
                             onAdd={onAdd} busy={busy}
                             isPending={pendingPattern !== undefined && s.description.includes(pendingPattern)} />
            ))}
          </tbody>
        </table>
      </div>
      {!showAll && sorted.length > 25 && (
        <button onClick={() => setShowAll(true)}
                style={{ ...sortOff, fontSize: 12 }}>
          Show all {sorted.length} merchants…
        </button>
      )}
    </Card>
  )
}

function SuggestionRow({ s, categories, onAdd, busy, isPending }: {
  s: RuleSuggestion
  categories: string[]
  onAdd: (r: { merchant_pattern: string; category: string }) => void
  busy: boolean
  isPending: boolean
}) {
  const [pattern, setPattern] = useState(s.description)
  const [category, setCategory] = useState(s.current_category)
  const catOptions = categories.includes(s.current_category)
    ? categories
    : [s.current_category, ...categories]

  return (
    <tr style={{ borderTop: '1px solid var(--line-soft)', opacity: isPending ? 0.5 : 1 }}>
      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s.count}</td>
      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(s.total_spend)}</td>
      <td style={{ ...td, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDate(s.last_date)}</td>
      <td style={{ ...td, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={s.description}>
        <code style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{s.description}</code>
      </td>
      <td style={td}>
        <input value={pattern} onChange={e => setPattern(e.target.value)}
               style={{ ...smallInputStyle, width: 200 }} />
      </td>
      <td style={td}>
        <select value={category} onChange={e => setCategory(e.target.value)} style={smallSelectStyle}>
          {catOptions.map(c => <option key={c}>{c}</option>)}
        </select>
      </td>
      <td style={td}>
        <button onClick={() => onAdd({ merchant_pattern: pattern.trim(), category })}
                disabled={busy || !pattern.trim()}
                style={primaryBtn}>
          {isPending ? 'Adding…' : 'Add rule'}
        </button>
      </td>
    </tr>
  )
}

const sortOn = {
  background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
  fontFamily: 'inherit', fontSize: 12, color: 'var(--ink)', fontWeight: 600,
  textDecoration: 'underline',
} as const
const sortOff = { ...sortOn, color: 'var(--muted)', fontWeight: 400, textDecoration: 'none' } as const

function NewRuleForm({ onSubmit, categories }: {
  onSubmit: (r: { merchant_pattern: string; category: string }) => void
  categories: string[]
}) {
  const [pattern, setPattern] = useState('')
  const [category, setCategory] = useState(categories[0] ?? '')
  return (
    <form onSubmit={e => {
      e.preventDefault()
      if (!pattern || !category) return
      onSubmit({ merchant_pattern: pattern, category })
      setPattern('')
    }} style={{ display: 'flex', gap: 8 }}>
      <input value={pattern} onChange={e => setPattern(e.target.value)}
             placeholder="Merchant substring (case-insensitive)…"
             style={{ ...smallInputStyle, flex: 1 }} />
      <select value={category} onChange={e => setCategory(e.target.value)} style={smallSelectStyle}>
        {categories.map(c => <option key={c}>{c}</option>)}
      </select>
      <button type="submit" style={primaryBtn}>Add</button>
    </form>
  )
}

function NewAliasForm({ onSubmit }: { onSubmit: (a: { pattern: string; canonical_name: string }) => void }) {
  const [pattern, setPattern] = useState('')
  const [canonical, setCanonical] = useState('')
  return (
    <form onSubmit={e => {
      e.preventDefault()
      if (!pattern || !canonical) return
      onSubmit({ pattern, canonical_name: canonical })
      setPattern(''); setCanonical('')
    }} style={{ display: 'flex', gap: 8 }}>
      <input value={pattern} onChange={e => setPattern(e.target.value)}
             placeholder="Pattern…" style={{ ...smallInputStyle, flex: 1 }} />
      <input value={canonical} onChange={e => setCanonical(e.target.value)}
             placeholder="Canonical name…" style={{ ...smallInputStyle, flex: 1 }} />
      <button type="submit" style={primaryBtn}>Add</button>
    </form>
  )
}

const th = { padding: '8px 10px', fontWeight: 500, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em' } as const
const td = { padding: '6px 10px', verticalAlign: 'middle' as const }
const smallInputStyle = {
  padding: '5px 8px', fontSize: 12, background: 'var(--surface)',
  border: '1px solid var(--line)', borderRadius: 2, fontFamily: 'inherit',
  color: 'var(--ink)',
} as const
const smallSelectStyle = { ...smallInputStyle, minWidth: 130 }
const primaryBtn = {
  padding: '6px 14px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
  background: 'var(--ink)', color: 'var(--paper)', border: '1px solid var(--ink)',
  borderRadius: 2, fontWeight: 500,
} as const
const iconBtn = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: 'var(--muted)', fontSize: 16, lineHeight: 1, padding: '2px 6px',
} as const

function Header() {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>06 · Rules</div>
      <h1 className="serif" style={{ fontSize: 32, fontWeight: 400, color: 'var(--ink)', margin: 0, letterSpacing: '-0.015em' }}>
        Categorization rules
      </h1>
    </div>
  )
}
