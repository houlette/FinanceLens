import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Dashboard from './views/Dashboard'
import CategoriesView from './views/CategoriesView'
import TransactionsView from './views/TransactionsView'
import RulesView from './views/RulesView'
import InsightsView from './views/InsightsView'
import ImportView from './views/ImportView'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
})

type ViewId = 'dashboard' | 'categories' | 'transactions' | 'insights' | 'rules' | 'import'
type Theme = 'paper' | 'midnight'

const NAV: { id: ViewId; label: string; no: string }[] = [
  { id: 'dashboard',    label: 'Dashboard',    no: '01' },
  { id: 'categories',   label: 'Categories',   no: '02' },
  { id: 'transactions', label: 'Transactions', no: '03' },
  { id: 'insights',     label: 'Insights',     no: '04' },
  { id: 'rules',        label: 'Rules',        no: '05' },
  { id: 'import',       label: 'Import',       no: '06' },
]

export default function App() {
  const [view, setView] = useState<ViewId>('dashboard')
  const [theme, setTheme] = useState<Theme>('paper')
  const [pickedCategory, setPickedCategory] = useState<string | undefined>()

  document.documentElement.dataset.theme = theme

  return (
    <QueryClientProvider client={queryClient}>
      <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', minHeight: '100vh' }}>
        <SideNav view={view} setView={setView} theme={theme} setTheme={setTheme} />
        <main style={{ padding: '32px 36px', maxWidth: 1320, width: '100%' }}>
          {view === 'dashboard'    && <Dashboard onPickCategory={c => { setPickedCategory(c); setView('categories') }} />}
          {view === 'categories'   && <CategoriesView initialCategory={pickedCategory} />}
          {view === 'transactions' && <TransactionsView />}
          {view === 'insights'     && <InsightsView />}
          {view === 'rules'        && <RulesView />}
          {view === 'import'       && <ImportView />}
        </main>
      </div>
    </QueryClientProvider>
  )
}

function SideNav({ view, setView, theme, setTheme }: {
  view: ViewId; setView: (v: ViewId) => void; theme: Theme; setTheme: (t: Theme) => void
}) {
  return (
    <aside style={{
      borderRight: '1px solid var(--line)', background: 'var(--paper)',
      padding: '32px 24px', position: 'sticky', top: 0,
      height: '100vh', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ paddingBottom: 24, borderBottom: '1px solid var(--line)' }}>
        <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.14em' }}>
          F · L
        </div>
        <div className="serif" style={{ fontSize: 22, lineHeight: 1.05, marginTop: 6, color: 'var(--ink)', letterSpacing: '-0.012em' }}>
          Finance<br />Lens
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10, fontStyle: 'italic' }}>
          spending · income · savings
        </div>
      </div>

      <nav style={{ flex: 1, paddingTop: 20 }}>
        {NAV.map(item => (
          <button key={item.id} onClick={() => setView(item.id)} style={{
            display: 'grid', gridTemplateColumns: '24px 1fr',
            width: '100%', textAlign: 'left', padding: '10px 4px',
            border: 'none', background: 'transparent', cursor: 'pointer',
            fontFamily: 'inherit', borderBottom: '1px solid var(--line-soft)',
            color: view === item.id ? 'var(--ink)' : 'var(--muted)',
            fontWeight: view === item.id ? 500 : 400,
          }}>
            <span className="mono" style={{ fontSize: 9.5, letterSpacing: '0.06em', color: 'var(--muted)', paddingTop: 3 }}>
              {item.no}
            </span>
            <span style={{ fontSize: 13.5 }}>{item.label}</span>
          </button>
        ))}
      </nav>

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Theme</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['paper', 'midnight'] as Theme[]).map(t => (
            <button key={t} onClick={() => setTheme(t)} style={{
              padding: '4px 10px', fontSize: 10.5, borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
              background: theme === t ? 'var(--ink)' : 'transparent',
              color:      theme === t ? 'var(--paper)' : 'var(--muted)',
              border: '1px solid ' + (theme === t ? 'var(--ink)' : 'var(--line)'),
            }}>{t}</button>
          ))}
        </div>
      </div>
    </aside>
  )
}
