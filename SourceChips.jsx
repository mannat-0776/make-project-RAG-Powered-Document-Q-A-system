import { useState } from 'react'

export default function SourceChips({ sources }) {
  const [expanded, setExpanded] = useState(null)
  if (!sources?.length) return null

  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase' }}>
        {sources.length} source{sources.length > 1 ? 's' : ''} retrieved
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {sources.map((s, i) => (
          <div key={s.chunk_id} style={{ display: 'flex', flexDirection: 'column' }}>
            <button
              onClick={() => setExpanded(expanded === i ? null : i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: expanded === i ? 'var(--surface3)' : 'var(--surface2)',
                border: `1px solid ${expanded === i ? 'var(--accent-dim)' : 'var(--border)'}`,
                borderRadius: 6, padding: '4px 9px',
                color: expanded === i ? 'var(--accent)' : 'var(--muted2)',
                fontFamily: 'var(--font-mono)', fontSize: 10,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: scoreColor(s.score), flexShrink: 0,
              }} />
              <span>src {i + 1}</span>
              <span style={{ color: scoreColor(s.score) }}>{(s.score * 100).toFixed(0)}%</span>
              <span style={{ color: 'var(--border2)' }}>{expanded === i ? '▲' : '▼'}</span>
            </button>

            {expanded === i && (
              <div style={{
                marginTop: 4,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 12px',
                maxWidth: 480,
              }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <Tag label="file" value={s.source} color="var(--accent)" />
                  {s.page > 0 && <Tag label="page" value={s.page} color="var(--purple)" />}
                  <Tag label="chunk" value={s.chunk_index} color="var(--muted2)" />
                  <Tag label="score" value={`${(s.score * 100).toFixed(1)}%`} color={scoreColor(s.score)} />
                </div>
                <div style={{
                  fontSize: 11, color: 'var(--muted2)',
                  fontFamily: 'var(--font-mono)',
                  lineHeight: 1.7, whiteSpace: 'pre-wrap',
                  maxHeight: 120, overflow: 'auto',
                }}>
                  {s.preview}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Tag({ label, value, color }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontFamily: 'var(--font-mono)',
      background: 'var(--surface2)', borderRadius: 4, padding: '2px 7px',
      border: '1px solid var(--border)',
    }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ color }}>{value}</span>
    </span>
  )
}

function scoreColor(score) {
  if (score >= 0.7) return 'var(--green)'
  if (score >= 0.4) return 'var(--amber)'
  return 'var(--muted2)'
}
