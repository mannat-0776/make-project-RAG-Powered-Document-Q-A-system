# ⬛ DocMind — RAG-Powered Document Q&A

A full-stack **Retrieval-Augmented Generation (RAG)** system. Upload any document, ask questions in natural language, and get accurate answers with source citations — all powered by **ChromaDB** (local vector store) + **Claude API**.

![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi)
![ChromaDB](https://img.shields.io/badge/ChromaDB-0.5-FF6B35?style=flat-square)
![Claude](https://img.shields.io/badge/Claude-Sonnet-orange?style=flat-square)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite)

---

## ✦ Features

- **Upload** `.txt`, `.md`, `.pdf`, `.csv` files or paste text directly
- **Semantic search** via ChromaDB + sentence-transformers embeddings (local, no API)
- **Streaming answers** from Claude — tokens stream in real time
- **Source citations** — every answer shows which chunks were retrieved with relevance scores
- **Expandable source viewer** — click any source chip to see the exact text chunk used
- **Session-based** — multiple independent sessions supported
- **Multi-turn** — follows up on previous questions in the same session
- **Dark techy UI** — built with React + Vite

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────┐
│                    React Frontend                     │
│   Upload → Chat UI → Source Viewer → Streaming SSE   │
└───────────────────────┬──────────────────────────────┘
                        │ HTTP / SSE
┌───────────────────────▼──────────────────────────────┐
│              FastAPI Backend                          │
│  /ingest/file   /ingest/text   /ask/stream            │
└──────────┬────────────────────────────┬──────────────┘
           │                            │
┌──────────▼──────────┐    ┌────────────▼──────────────┐
│  ChromaDB (local)   │    │   Anthropic Claude API     │
│  sentence-transformers│  │   claude-sonnet-4          │
│  Persistent on disk │    │   Streaming generation     │
└─────────────────────┘    └───────────────────────────┘
```

### RAG Pipeline Steps

```
Document
   │
   ▼ DocumentLoader (.txt/.md/.pdf)
Raw Text
   │
   ▼ TextChunker (600 chars, 100 overlap)
Chunks [ ][ ][ ][ ]
   │
   ▼ ChromaDB.add() + sentence-transformers embedding
Vector Store (persisted to ./chroma_db)
   │
   ▼ Query: ChromaDB.query(question, top_k=5)
Top K Chunks (by cosine similarity)
   │
   ▼ Build context + call Claude API (streaming)
Answer with [Source N] citations
```

---

## 🚀 Quick Start

### 1. Clone

```bash
git clone https://github.com/yourusername/docmind.git
cd docmind
```

### 2. Backend setup

```bash
cd backend
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Set your API key
cp .env.example .env
# Edit .env and add: ANTHROPIC_API_KEY=sk-ant-...

# Run
uvicorn main:app --reload --port 8000
```

> First run downloads the sentence-transformers model (~80MB). Subsequent runs use the cache.

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

---

## 📁 Project Structure

```
docmind/
├── backend/
│   ├── main.py            # FastAPI app, routes
│   ├── rag_engine.py      # Core RAG: chunking, ChromaDB, Claude
│   ├── requirements.txt
│   ├── .env.example
│   └── chroma_db/         # Auto-created: local vector store
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Main layout + chat logic
│   │   ├── api.js             # API client + SSE streaming
│   │   ├── components/
│   │   │   ├── UploadPanel.jsx   # File upload + paste + stats
│   │   │   ├── ChatMessage.jsx   # Message bubbles + markdown
│   │   │   └── SourceChips.jsx   # Source citation chips
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
└── README.md
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/session/new` | Create a new session |
| `POST` | `/ingest/file` | Upload and index a file |
| `POST` | `/ingest/text` | Index pasted text |
| `POST` | `/ask/stream` | Stream answer (SSE) |
| `POST` | `/ask` | Non-streaming answer |
| `GET`  | `/status/{id}` | Session status |
| `POST` | `/clear` | Reset session |
| `GET`  | `/health` | Health check |

---

## ⚙️ Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | required | Claude API key |
| `CHROMA_PATH` | `./chroma_db` | Local ChromaDB storage path |
| Chunk size | 600 chars | Edit in `rag_engine.py` |
| Overlap | 100 chars | Edit in `rag_engine.py` |
| Top K | 5 chunks | Passed per request |

---

## 🛠️ Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite |
| Backend | Python 3.10+ · FastAPI · Uvicorn |
| Vector DB | ChromaDB (local persistent) |
| Embeddings | `all-MiniLM-L6-v2` via sentence-transformers |
| LLM | Anthropic Claude (claude-sonnet-4) |
| Streaming | Server-Sent Events (SSE) |
| PDF | PyPDF2 |

---

## 📌 Notes

- ChromaDB stores vectors **locally** in `./chroma_db` — no external vector DB needed
- Embeddings are computed **locally** via sentence-transformers — only Q&A calls the Claude API
- Each session gets its own ChromaDB collection
- In production: add authentication, use a DB for session storage, rate limiting

---

Made with ⬛ by [Mannat](https://github.com/mannat-0776)
