import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { Card } from '../components/Card'

interface UploadState {
  status: 'idle' | 'uploading' | 'success' | 'error'
  message?: string
  detail?: string
}

export default function ImportView() {
  const qc = useQueryClient()
  const status = useQuery({ queryKey: ['ingestStatus'], queryFn: api.ingestStatus })
  const [files, setFiles] = useState<{ name: string; state: UploadState }[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const upload = async (file: File) => {
    setFiles(f => [...f, { name: file.name, state: { status: 'uploading' } }])
    try {
      const r = await api.uploadCsv(file)
      if (r.detail) throw new Error(r.detail)
      const detail = [
        `${r.inserted} inserted`,
        r.skipped_duplicates ? `${r.skipped_duplicates} duplicates skipped` : null,
        r.warnings?.length ? `${r.warnings.length} warnings` : null,
      ].filter(Boolean).join(' · ')
      setFiles(f => f.map(x => x.name === file.name
        ? { name: file.name, state: { status: 'success', message: `${r.parsed} rows parsed`, detail } }
        : x))
      qc.invalidateQueries()
    } catch (e: unknown) {
      setFiles(f => f.map(x => x.name === file.name
        ? { name: file.name, state: { status: 'error', message: e instanceof Error ? e.message : 'Failed' } }
        : x))
    }
  }

  const handleFiles = (list: FileList | null) => {
    if (!list) return
    for (const f of Array.from(list)) upload(f)
  }

  return (
    <div>
      <Header />

      <Card style={{ marginBottom: 20 }}>
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
          style={{
            border: `2px dashed ${dragging ? 'var(--accent-2)' : 'var(--line)'}`,
            borderRadius: 4, padding: '38px 24px', textAlign: 'center',
            background: dragging ? 'var(--surface)' : 'transparent',
            cursor: 'pointer', transition: 'all .15s',
          }}>
          <input ref={inputRef} type="file" accept=".csv" multiple style={{ display: 'none' }}
                 onChange={e => handleFiles(e.target.files)} />
          <div className="serif" style={{ fontSize: 22, color: 'var(--ink)', marginBottom: 6 }}>
            Drop CSV statements here
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            Or click to browse. Multiple files supported. Duplicate rows are skipped automatically.
          </div>
        </div>

        {files.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>This session</div>
            {files.map(f => (
              <div key={f.name + f.state.status} style={{
                padding: '8px 12px', borderTop: '1px solid var(--line-soft)',
                display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5,
              }}>
                <span style={{
                  width: 60,
                  color: f.state.status === 'success' ? 'var(--pos)'
                    : f.state.status === 'error' ? 'var(--neg)'
                    : 'var(--accent-2)',
                }}>{f.state.status}</span>
                <span style={{ flex: 1, color: 'var(--ink)' }}>{f.name}</span>
                <span style={{ color: 'var(--muted)' }}>{f.state.message}</span>
                {f.state.detail && (
                  <span style={{ color: 'var(--muted-2)', fontSize: 11 }}>{f.state.detail}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 18 }}>
        <Card title="Data summary" eyebrow="Stored locally">
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Transactions</div>
          <div className="num serif" style={{ fontSize: 32, color: 'var(--ink)' }}>
            {(status.data?.transactions.count ?? 0).toLocaleString()}
          </div>
          {status.data?.transactions.from && (
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>
              {status.data.transactions.from} – {status.data.transactions.to}
            </div>
          )}
        </Card>

        <Card title="Recent imports">
          {(status.data?.imports ?? []).length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>No imports yet.</div>
          )}
          {(status.data?.imports ?? []).map((l, i) => (
            <div key={i} style={{
              padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid var(--line-soft)',
              display: 'flex', gap: 12, alignItems: 'center', fontSize: 12,
            }}>
              <span style={{ flex: 1, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {l.filename}
              </span>
              <span className="num" style={{ color: 'var(--muted)' }}>{l.inserted} ins</span>
              {l.skipped > 0 && <span className="num" style={{ color: 'var(--muted-2)' }}>{l.skipped} dup</span>}
              <span style={{ color: 'var(--muted-2)' }}>{l.format}</span>
              <span style={{ color: 'var(--muted-2)' }}>{l.at?.slice(0, 16)}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}

function Header() {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>06 · Import</div>
      <h1 className="serif" style={{ fontSize: 32, fontWeight: 400, color: 'var(--ink)', margin: 0, letterSpacing: '-0.015em' }}>
        Import CSV statements
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6, maxWidth: 640 }}>
        Drop bank or credit card CSVs. Supported header conventions: <code>Transaction date</code>,
        <code> Trans. Date</code>, <code> Transaction Date</code>. Amount can be a signed Amount,
        Credit+Debit columns, or have a Credit/debit indicator.
      </p>
    </div>
  )
}
