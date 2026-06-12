export interface Transaction {
  id: number
  date: string                 // ISO YYYY-MM-DD
  description: string
  description_raw: string
  amount: number               // positive = spend, negative = income
  category: string
  account_number: string | null
  check_number: string | null
  user_overridden: boolean
}

export interface MonthlyByCategory {
  months: string[]             // ['2025-01', ...]
  categories: string[]
  data: { month: string; values: Record<string, number> }[]
}

export interface IncomeVsSpendRow {
  month: string
  spend: number
  income: number
}

export interface CategoryTotal {
  category: string
  total: number
  count: number
}

export interface MerchantTotal {
  merchant: string
  total: number
  count: number
}

export interface Kpis {
  income: number
  spend: number
  savings: number
  net: number
}

export interface CategoryRule {
  id: number
  merchant_pattern: string
  category: string
  priority: number
  active: boolean
}

export interface MerchantAlias {
  id: number
  pattern: string
  canonical_name: string
}

export interface RuleSuggestion {
  description: string
  count: number
  total_spend: number
  current_category: string     // most common bank-assigned category in the group
  last_date: string            // ISO YYYY-MM-DD of most recent transaction
}

export interface IngestStatus {
  transactions: { count: number; from: string | null; to: string | null }
  imports: {
    filename: string
    at: string | null
    parsed: number
    inserted: number
    skipped: number
    format: string | null
    warnings: string | null
  }[]
}

export interface MomDelta {
  month: string
  category: string
  delta: number
  current: number
  top_transactions: { id: number; date: string; description: string; amount: number }[]
}

export interface HighValueTxn {
  id: number
  date: string
  description: string
  category: string
  amount: number
}

export interface QuarterCompare {
  current_label: string
  previous_label: string
  rows: {
    category: string
    previous: number
    current: number
    change: number
    pct_change: number | null
  }[]
}
