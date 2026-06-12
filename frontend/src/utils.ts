export const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

export function fmtMoney(n: number | null | undefined, opts: { signed?: boolean; cents?: boolean } = {}): string {
  if (n == null || isNaN(n)) return "—"
  const abs = Math.abs(n)
  const fixed = opts.cents ? 2 : 0
  const s = abs.toLocaleString(undefined, { minimumFractionDigits: fixed, maximumFractionDigits: fixed })
  const sign = n < 0 ? "−" : opts.signed && n > 0 ? "+" : ""
  return `${sign}$${s}`
}

export function fmtNum(n: number | null | undefined, d = 0): string {
  if (n == null || isNaN(n)) return "—"
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })
}

export function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  if (!m) return ym
  return `${MONTH_NAMES[m - 1]} ${String(y).slice(2)}`
}

export function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

export function pct(n: number | null | undefined, d = 0): string {
  if (n == null || isNaN(n)) return "—"
  return n.toFixed(d) + "%"
}

// A repeatable categorical palette modeled on tab20-ish but tuned to the paper theme.
export const CATEGORY_COLORS = [
  "#b85a3e", "#3a627a", "#6b8a5f", "#d8a04a", "#8b3a37",
  "#7e9764", "#c8a04a", "#5a8a8a", "#a87b3a", "#3f6e57",
  "#b86a4f", "#4a6b7a", "#8aa67e", "#c97a5a", "#6a7b3a",
  "#9d917f", "#7a5e3e", "#5f8a76", "#c4a878", "#6b4a3e",
]

const _colorCache = new Map<string, string>()
export function colorFor(label: string): string {
  let c = _colorCache.get(label)
  if (c) return c
  // Stable hash → palette index
  let h = 0
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0
  c = CATEGORY_COLORS[h % CATEGORY_COLORS.length]
  _colorCache.set(label, c)
  return c
}

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00")
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}
