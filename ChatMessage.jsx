import SourceChips from './SourceChips'

export default function ChatMessage({ msg }) {
  const isUser = msg.role === 'user'

  if (isUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{
          maxWidth: '75%',
          background: 'rgba(56,189,248,0.08)',
          border: '1px solid rgba(56,189,248,0.15)',
          borderRadius: '12px 12px 3px 12px',
          padding: '10px 14px',
          fontSize: 14, color: 'var(--text)', lineHeight: 1.6,
        }}>
          {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: '88%' }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '3px 12px 12px 12px',
        padding: '12px 16px',
        fontSize: 14, color: 'var(--text)', lineHeight: 1.8,
      }}>
        <MarkdownText text={msg.content} streaming={msg.streaming} />
      </div>
      {msg.sources?.length > 0 && <SourceChips sources={msg.sources} />}
      {msg.tokens && (
        <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--muted)', paddingLeft: 4 }}>
          {msg.tokens} tokens
        </div>
      )}
    </div>
  )
}

function MarkdownText({ text, streaming }) {
  // Simple markdown renderer without heavy deps
  if (!text) {
    return streaming ? <Cursor /> : null
  }

  const lines = text.split('\n')
  const elements = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      elements.push(
        <pre key={i} style={{
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '10px 12px', margin: '8px 0',
          fontFamily: 'var(--font-mono)', fontSize: 12, overflowX: 'auto',
          lineHeight: 1.6, color: 'var(--text)',
        }}>
          <code>{codeLines.join('\n')}</code>
        </pre>
      )
      i++
      continue
    }

    // Heading
    if (line.startsWith('### ')) {
      elements.push(<div key={i} style={{ fontWeight: 600, fontSize: 14, marginTop: 12, marginBottom: 4, color: 'var(--accent)' }}>{line.slice(4)}</div>)
    } else if (line.startsWith('## ')) {
      elements.push(<div key={i} style={{ fontWeight: 600, fontSize: 15, marginTop: 14, marginBottom: 5, color: 'var(--accent)' }}>{line.slice(3)}</div>)
    } else if (line.startsWith('# ')) {
      elements.push(<div key={i} style={{ fontWeight: 700, fontSize: 16, marginTop: 14, marginBottom: 6, color: 'var(--accent)' }}>{line.slice(2)}</div>)
    }
    // Bullet
    else if (line.match(/^[-*]\s/)) {
      elements.push(
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
          <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }}>▸</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      )
    }
    // Numbered list
    else if (line.match(/^\d+\.\s/)) {
      const match = line.match(/^(\d+)\.\s(.*)/)
      elements.push(
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
          <span style={{ color: 'var(--muted2)', flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{match[1]}.</span>
          <span>{renderInline(match[2])}</span>
        </div>
      )
    }
    // Blank line
    else if (line.trim() === '') {
      elements.push(<div key={i} style={{ height: 6 }} />)
    }
    // Normal paragraph
    else {
      elements.push(<div key={i}>{renderInline(line)}</div>)
    }

    i++
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {elements}
      {streaming && <Cursor />}
    </div>
  )
}

function renderInline(text) {
  // Bold, italic, inline code, source citations
  const parts = []
  let remaining = text
  let key = 0

  const patterns = [
    { re: /\*\*(.+?)\*\*/,  render: (m) => <strong key={key++} style={{ color: 'var(--text)', fontWeight: 600 }}>{m[1]}</strong> },
    { re: /\*(.+?)\*/,       render: (m) => <em key={key++} style={{ color: 'var(--muted2)' }}>{m[1]}</em> },
    { re: /`(.+?)`/,          render: (m) => <code key={key++} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--surface2)', padding: '1px 5px', borderRadius: 4, color: 'var(--accent)' }}>{m[1]}</code> },
    { re: /\[Source (\d+)\]/, render: (m) => <span key={key++} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--accent-dim)', color: 'var(--accent)', padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(56,189,248,0.2)' }}>[{m[1]}]</span> },
  ]

  while (remaining.length > 0) {
    let earliest = null
    let earliestIndex = Infinity

    for (const p of patterns) {
      const m = remaining.match(p.re)
      if (m && m.index < earliestIndex) {
        earliest = { m, render: p.render, index: m.index }
        earliestIndex = m.index
      }
    }

    if (!earliest) {
      parts.push(remaining)
      break
    }

    if (earliest.index > 0) parts.push(remaining.slice(0, earliest.index))
    parts.push(earliest.render(earliest.m))
    remaining = remaining.slice(earliest.index + earliest.m[0].length)
  }

  return parts
}

function Cursor() {
  return (
    <span style={{
      display: 'inline-block', width: 2, height: 14,
      background: 'var(--accent)', marginLeft: 2, verticalAlign: 'middle',
      animation: 'blink 1s step-end infinite',
    }}>
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </span>
  )
}
