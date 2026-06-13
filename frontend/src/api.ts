import type {
  Transaction, MonthlyByCategory, IncomeVsSpendRow, CategoryTotal, MerchantTotal,
  Kpis, CategoryRule, MerchantAlias, IngestStatus, MomDelta, HighValueTxn, QuarterCompare,
  RuleSuggestion, RecurringResponse,
} from './types'

const BASE = '/api'

type Params = Record<string, string | number | boolean | undefined | null>

function qs(params?: Params): string {
  if (!params) return ''
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    u.set(k, String(v))
  }
  const s = u.toString()
  return s ? '?' + s : ''
}

async function get<T>(path: string, params?: Params): Promise<T> {
  const res = await fetch(BASE + path + qs(params))
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function jsonReq<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text}`)
  }
  return res.json()
}

export const api = {
  health: () => get<{ status: string }>('/health'),

  // Ingest
  ingestStatus: () => get<IngestStatus>('/ingest/status'),
  uploadCsv: (file: File) => {
    const fd = new FormData(); fd.append('file', file)
    return fetch(BASE + '/ingest/csv', { method: 'POST', body: fd })
      .then(r => r.json())
  },

  // Transactions
  transactions: (params?: Params) => get<Transaction[]>('/transactions', params),
  patchTransaction: (id: number, patch: { category?: string; description?: string }) =>
    jsonReq<Transaction>('PATCH', `/transactions/${id}`, patch),
  categories: () => get<string[]>('/transactions/categories'),

  // Summaries
  monthly: (params?: Params) => get<MonthlyByCategory>('/summaries/monthly', params),
  incomeVsSpend: (params?: Params) => get<IncomeVsSpendRow[]>('/summaries/income-vs-spend', params),
  byCategory: (params?: Params) => get<CategoryTotal[]>('/summaries/by-category', params),
  byMerchant: (params?: Params) => get<MerchantTotal[]>('/summaries/by-merchant', params),
  kpis: (params?: Params) => get<Kpis>('/summaries/kpis', params),

  // Rules
  listRules: () => get<CategoryRule[]>('/rules/categories'),
  createRule: (r: { merchant_pattern: string; category: string; priority?: number }) =>
    jsonReq<CategoryRule>('POST', '/rules/categories', r),
  updateRule: (id: number, patch: Partial<CategoryRule>) =>
    jsonReq<CategoryRule>('PATCH', `/rules/categories/${id}`, patch),
  deleteRule: (id: number) =>
    fetch(BASE + `/rules/categories/${id}`, { method: 'DELETE' }).then(r => r.json()),
  listAliases: () => get<MerchantAlias[]>('/rules/aliases'),
  createAlias: (a: { pattern: string; canonical_name: string }) =>
    jsonReq<MerchantAlias>('POST', '/rules/aliases', a),
  deleteAlias: (id: number) =>
    fetch(BASE + `/rules/aliases/${id}`, { method: 'DELETE' }).then(r => r.json()),
  reapplyRules: () =>
    fetch(BASE + '/rules/reapply', { method: 'POST' }).then(r => r.json()),
  ruleSuggestions: () => get<RuleSuggestion[]>('/rules/suggestions'),

  // Insights
  momDeltas: (params?: Params) => get<MomDelta[]>('/insights/mom-deltas', params),
  highValue: (params?: Params) => get<HighValueTxn[]>('/insights/high-value', params),
  quarterCompare: (year: number, quarter: number) =>
    get<QuarterCompare>('/insights/quarter-compare', { year, quarter }),

  // Recurring
  recurring: () => get<RecurringResponse>('/recurring'),
}
