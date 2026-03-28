import { useState, useEffect, useRef, useCallback } from 'react'
import UploadPanel from './components/UploadPanel'
import ChatMessage from './components/ChatMessage'
import { newSession, askStream, clearSession } from './api'

const SUGGESTIONS = [
  'Summarize the main topics in this document',
  'What are the key conclusions?',
  'List all important terms or definitions',
  'What problems does this document address?',
  'Give me the top 5 takeaways',
]

export default function App() {
  const [sessionId, setSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [docStats, setDocStats] = useState(null)
  const [totalTokens, setTotalTokens] = useState(0)
  const [backendOnline, setBackendOnline] = useState(null)
  const chatEndRef = useRef(null)
  const inputRef = useRef(null)

  // Init session
  useEffect(() => {
    init()
  }, [])

  async function init() {
    try {
      const id = await newSession()
      setSessionId(id)
      setBackendOnline(true)
    } catch {
      setBackendOnline(false)
    }
  }

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleIngest(stats) {
    setDocStats(stats)
    setMessages([{
      role: 'assistant',
      content: `✓ **${stats.source}** indexed successfully.\n\n${stats.chunks} chunks · ${stats.words?.toLocaleString()} words · ${stats.characters?.toLocaleString()} characters\n\nReady to answer questions.`,
      sources: [],
    }])
  }

  async function sendQuestion(question) {
    const q = (question || input).trim()
    if (!q || loading || !sessionId || !docStats) return

    setInput('')
    setLoading(true)

    const userMsg = { role: 'user', content: q }
    const assistantMsg = { role: 'assistant', content: '', sources: [], streaming: true }
    setMessages(prev => [...prev, userMsg, assistantMsg])

    try {
      let answer = ''
      let sources = []

      for await (const event of askStream(sessionId, q)) {
        if (event.type === 'sources') {
          sources = event.data
          setMessages(prev => {
            const updated = [...prev]
            updated[updated.length - 1] = { ...updated[updated.length - 1], sources }
            return updated
          })
        } else if (event.type === 'token') {
          answer += event.data
          setMessages(prev => {
            const updated = [...prev]
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              content: answer,
            }
            return updated
          })
        } else if (event.type === 'done') {
          setMessages(prev => {
            const updated = [...prev]
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              streaming: false,
            }
            return updated
          })
        } else if (event.type === 'error') {
          throw new Error(event.data)
        }
      }
    } catch (e) {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: 'assistant',
          content: `Error: ${e.message}`,
          sources: [],
          streaming: false,
        }
        return updated
      })
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  async function handleClear() {
    if (!sessionId) return
    await clearSession(sessionId)
    setDocStats(null)
    setMessages([])
    setTotalTokens(0)
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendQuestion()
    }
  }

  const canAsk = !!docStats && !loading

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ── Sidebar ── */}
      <div style={{
        width: 300, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        borderRight: '1px solid var(--border)',
        overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{
          padding: '16px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: 'linear-gradient(135deg, rgba(56,189,248,0.2), rgba(167,139,250,0.2))',
            border: '1px solid rgba(56,189,248,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13,
          }}>⬛</div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 500, letterSpacing: '-0.3px' }}>
              Doc<span style={{ color: 'var(--accent)' }}>Mind</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)', letterSpacing: '1px' }}>RAG · Q&A</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: backendOnline === null ? 'var(--muted)' : backendOnline ? 'var(--green)' : 'var(--red)',
              boxShadow: backendOnline ? '0 0 6px var(--green)' : 'none',
            }} />
            <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
              {backendOnline === null ? '...' : backendOnline ? 'online' : 'offline'}
            </span>
          </div>
        </div>

        {/* Upload */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <UploadPanel
            sessionId={sessionId}
            onIngest={handleIngest}
            stats={docStats}
          />

          {/* Suggestions */}
          {docStats && (
            <div style={{ padding: '16px 18px' }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>
                Try asking
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendQuestion(s)}
                    disabled={!canAsk}
                    style={{
                      textAlign: 'left', padding: '7px 10px',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 6, color: 'var(--muted2)',
                      fontSize: 11, cursor: canAsk ? 'pointer' : 'default',
                      transition: 'all 0.15s', lineHeight: 1.4,
                    }}
                    onMouseEnter={e => { if (canAsk) { e.target.style.borderColor = 'var(--border2)'; e.target.style.color = 'var(--text)' }}}
                    onMouseLeave={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.color = 'var(--muted2)' }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {docStats && (
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
            <button
              onClick={handleClear}
              style={{
                width: '100%', padding: '7px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--muted)',
                fontSize: 11, cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.target.style.borderColor = 'var(--red)'; e.target.style.color = 'var(--red)' }}
              onMouseLeave={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.color = 'var(--muted)' }}
            >
              ✕ Reset Session
            </button>
          </div>
        )}
      </div>

      {/* ── Chat panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Chat header */}
        <div style={{
          padding: '14px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
            {docStats
              ? <><span style={{ color: 'var(--green)' }}>●</span> {docStats.source} · {docStats.chunks} chunks</>
              : <><span style={{ color: 'var(--muted)' }}>○</span> No document loaded</>
            }
          </div>
          {messages.length > 0 && (
            <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
              {messages.filter(m => m.role === 'user').length} questions
            </div>
          )}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {messages.length === 0 ? (
            <EmptyState hasDoc={!!docStats} />
          ) : (
            messages.map((m, i) => <ChatMessage key={i} msg={m} />)
          )}
          {loading && messages[messages.length - 1]?.role !== 'assistant' && (
            <ThinkingIndicator />
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input bar */}
        <div style={{
          padding: '14px 24px 18px',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          {!docStats && (
            <div style={{
              textAlign: 'center', fontSize: 11,
              color: 'var(--muted)', fontFamily: 'var(--font-mono)',
              marginBottom: 10, padding: '7px 12px',
              background: 'var(--surface)', borderRadius: 6,
              border: '1px solid var(--border)',
            }}>
              ← Upload a document first to start asking questions
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={docStats ? 'Ask a question about your document... (Enter to send)' : 'Upload a document first...'}
              disabled={!canAsk && !loading}
              rows={1}
              style={{
                flex: 1,
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: 10, padding: '11px 14px',
                color: 'var(--text)',
                fontFamily: 'var(--font-sans)', fontSize: 14,
                resize: 'none', outline: 'none',
                maxHeight: 120, minHeight: 44,
                lineHeight: 1.5, transition: 'border-color 0.15s',
                opacity: docStats ? 1 : 0.5,
              }}
              onFocus={e => e.target.style.borderColor = 'var(--border2)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
              onInput={e => {
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
            />
            <button
              onClick={() => sendQuestion()}
              disabled={!canAsk || !input.trim()}
              style={{
                width: 44, height: 44, borderRadius: 10,
                flexShrink: 0,
                background: canAsk && input.trim() ? 'var(--accent)' : 'var(--surface2)',
                border: '1px solid var(--border)',
                color: canAsk && input.trim() ? '#000' : 'var(--muted)',
                fontSize: 17, cursor: canAsk && input.trim() ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s', fontWeight: 'bold',
              }}
            >
              ↑
            </button>
          </div>
          <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
              Session: <span style={{ color: 'var(--muted2)' }}>{sessionId || '...'}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
              chromadb · claude-sonnet
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ hasDoc }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 14, color: 'var(--muted)', textAlign: 'center',
      padding: 40,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22,
      }}>⬛</div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
          {hasDoc ? 'Ready to answer questions' : 'Upload a document to begin'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 340, lineHeight: 1.7 }}>
          {hasDoc
            ? 'Ask anything about your document. I\'ll retrieve the most relevant chunks and answer with citations.'
            : 'Supports .txt, .md, .pdf, .csv files. Your document is indexed locally in ChromaDB — nothing leaves your machine except the Q&A to Claude API.'}
        </div>
      </div>
      {hasDoc && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center',
          maxWidth: 400, marginTop: 4,
        }}>
          {['RAG', 'ChromaDB', 'Claude API', 'Semantic Search', 'Streaming'].map(tag => (
            <span key={tag} style={{
              fontSize: 10, fontFamily: 'var(--font-mono)',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '3px 8px', color: 'var(--muted2)',
            }}>{tag}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function ThinkingIndicator() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '3px 12px 12px 12px',
      width: 'fit-content', fontSize: 12, color: 'var(--muted)',
    }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 5, height: 5, borderRadius: '50%',
            background: 'var(--accent)', opacity: 0.4,
            animation: 'dotpulse 1.4s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
          }} />
        ))}
      </div>
      <style>{`@keyframes dotpulse{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}`}</style>
      Retrieving context...
    </div>
  )
}
