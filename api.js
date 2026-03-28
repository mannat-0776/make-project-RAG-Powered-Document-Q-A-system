const BASE = '/api'

export async function newSession() {
  const r = await fetch(`${BASE}/session/new`, { method: 'POST' })
  const d = await r.json()
  return d.session_id
}

export async function ingestFile(sessionId, file, onProgress) {
  const form = new FormData()
  form.append('file', file)
  form.append('session_id', sessionId)
  const r = await fetch(`${BASE}/ingest/file`, { method: 'POST', body: form })
  if (!r.ok) {
    const err = await r.json()
    throw new Error(err.detail || 'Upload failed')
  }
  return r.json()
}

export async function ingestText(sessionId, text, name) {
  const r = await fetch(`${BASE}/ingest/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, name, session_id: sessionId }),
  })
  if (!r.ok) {
    const err = await r.json()
    throw new Error(err.detail || 'Ingest failed')
  }
  return r.json()
}

export async function* askStream(sessionId, question, topK = 5) {
  const r = await fetch(`${BASE}/ask/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, session_id: sessionId, top_k: topK }),
  })
  if (!r.ok) {
    const err = await r.json()
    throw new Error(err.detail || 'Ask failed')
  }

  const reader = r.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          yield JSON.parse(line.slice(6))
        } catch {}
      }
    }
  }
}

export async function clearSession(sessionId) {
  await fetch(`${BASE}/clear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  })
}

export async function getStatus(sessionId) {
  const r = await fetch(`${BASE}/status/${sessionId}`)
  return r.json()
}
