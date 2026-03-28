import { useState, useRef } from 'react'
import { ingestFile, ingestText } from '../api'

const styles = {
  panel: {
    display: 'flex', flexDirection: 'column', gap: 16,
    padding: '20px 18px',
    borderBottom: '1px solid var(--border)',
  },
  sectionLabel: {
    fontSize: 10, fontFamily: 'var(--font-mono)',
    color: 'var(--muted)', letterSpacing: '1.5px',
    textTransform: 'uppercase', marginBottom: 8, fontWeight: 500,
  },
  dropZone: {
    border: '1.5px dashed var(--border2)',
    borderRadius: 'var(--radius-lg)',
    padding: '24px 16px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    position: 'relative',
    background: 'transparent',
  },
  dropZoneActive: {
    borderColor: 'var(--accent)',
    background: 'rgba(56,189,248,0.04)',
  },
  fileInput: {
    position: 'absolute', inset: 0, opacity: 0,
    cursor: 'pointer', width: '100%', height: '100%',
  },
  icon: { fontSize: 22, marginBottom: 6, color: 'var(--muted2)' },
  uploadTitle: { fontSize: 13, fontWeight: 500, marginBottom: 3 },
  uploadSub: { fontSize: 11, color: 'var(--muted2)', lineHeight: 1.6 },
  divider: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)',
  },
  dividerLine: { flex: 1, height: 1, background: 'var(--border)' },
  textarea: {
    width: '100%', background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', padding: '9px 11px',
    color: 'var(--text)', fontFamily: 'var(--font-mono)',
    fontSize: 11, resize: 'none', outline: 'none',
    height: 80, lineHeight: 1.6,
    transition: 'border-color 0.15s',
  },
  btn: {
    width: '100%', padding: '9px',
    background: 'var(--surface2)',
    border: '1px solid var(--border2)',
    borderRadius: 'var(--radius)',
    color: 'var(--text)', fontSize: 12, fontWeight: 500,
    cursor: 'pointer', transition: 'all 0.15s',
  },
  progressBar: {
    height: 3, borderRadius: 3,
    background: 'var(--border2)', overflow: 'hidden', marginTop: 8,
  },
  progressFill: {
    height: '100%', borderRadius: 3,
    background: 'var(--accent)',
    transition: 'width 0.4s ease',
  },
  statsBox: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '12px 14px',
  },
  statRow: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', padding: '3px 0',
  },
  statLabel: { fontSize: 11, color: 'var(--muted2)' },
  statVal: { fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)' },
  error: {
    fontSize: 11, color: 'var(--red)',
    background: 'rgba(248,113,113,0.08)',
    border: '1px solid rgba(248,113,113,0.2)',
    borderRadius: 6, padding: '8px 10px',
  },
}

export default function UploadPanel({ sessionId, onIngest, stats }) {
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [pasteText, setPasteText] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef()

  async function handleFile(file) {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['txt','md','pdf','rst','csv'].includes(ext)) {
      setError(`Unsupported file type: .${ext}`)
      return
    }
    setError('')
    setLoading(true)
    setProgress(10)
    try {
      setProgress(40)
      const res = await ingestFile(sessionId, file)
      setProgress(100)
      setTimeout(() => setProgress(0), 800)
      onIngest(res.stats)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handlePaste() {
    if (pasteText.trim().length < 50) {
      setError('Text too short (min 50 characters)')
      return
    }
    setError('')
    setLoading(true)
    setProgress(30)
    try {
      setProgress(60)
      const res = await ingestText(sessionId, pasteText, 'pasted_document')
      setProgress(100)
      setTimeout(() => setProgress(0), 800)
      onIngest(res.stats)
      setPasteText('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.panel}>
      <div>
        <div style={styles.sectionLabel}>Upload Document</div>
        <div
          style={{ ...styles.dropZone, ...(dragging ? styles.dropZoneActive : {}) }}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => {
            e.preventDefault(); setDragging(false)
            handleFile(e.dataTransfer.files[0])
          }}
        >
          <input
            ref={fileRef} type="file" style={styles.fileInput}
            accept=".txt,.md,.pdf,.rst,.csv"
            onChange={e => handleFile(e.target.files[0])}
          />
          <div style={styles.icon}>⬆</div>
          <div style={styles.uploadTitle}>
            {loading ? 'Processing...' : 'Drop file or click'}
          </div>
          <div style={styles.uploadSub}>.txt · .md · .pdf · .csv</div>
        </div>
        {progress > 0 && (
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${progress}%` }} />
          </div>
        )}
      </div>

      <div>
        <div style={{ ...styles.divider }}>
          <div style={styles.dividerLine} />
          <span>or paste text</span>
          <div style={styles.dividerLine} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <textarea
          style={styles.textarea}
          placeholder="Paste document text here..."
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
          onFocus={e => e.target.style.borderColor = 'var(--border2)'}
        />
        <button
          style={styles.btn}
          onClick={handlePaste}
          disabled={loading}
          onMouseEnter={e => e.target.style.background = 'var(--border)'}
          onMouseLeave={e => e.target.style.background = 'var(--surface2)'}
        >
          {loading ? 'Indexing...' : 'Index Text →'}
        </button>
      </div>

      {error && <div style={styles.error}>⚠ {error}</div>}

      {stats && (
        <div style={styles.statsBox}>
          <div style={styles.sectionLabel}>Indexed</div>
          <div style={styles.statRow}>
            <span style={styles.statLabel}>Source</span>
            <span style={{ ...styles.statVal, color: 'var(--green)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stats.source}</span>
          </div>
          <div style={styles.statRow}>
            <span style={styles.statLabel}>Chunks</span>
            <span style={styles.statVal}>{stats.chunks}</span>
          </div>
          <div style={styles.statRow}>
            <span style={styles.statLabel}>Words</span>
            <span style={styles.statVal}>{stats.words?.toLocaleString()}</span>
          </div>
          <div style={styles.statRow}>
            <span style={styles.statLabel}>Characters</span>
            <span style={styles.statVal}>{stats.characters?.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  )
}
