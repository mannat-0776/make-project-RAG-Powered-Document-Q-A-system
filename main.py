"""
DocMind RAG Backend — FastAPI + ChromaDB + Claude API
Run: uvicorn main:app --reload --port 8000
"""

import os
import uuid
import asyncio
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from rag_engine import RAGEngine

# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(title="DocMind RAG API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# One engine per session (keyed by session_id)
# In production: use Redis or a proper session store
engines: dict[str, RAGEngine] = {}

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
ALLOWED_EXTENSIONS = {".txt", ".md", ".pdf", ".rst", ".csv"}


def get_engine(session_id: str) -> RAGEngine:
    if session_id not in engines:
        engines[session_id] = RAGEngine(session_id=session_id)
    return engines[session_id]


# ── Schemas ───────────────────────────────────────────────────────────────────
class AskRequest(BaseModel):
    question: str
    session_id: str
    top_k: int = 5


class PasteRequest(BaseModel):
    text: str
    name: str = "pasted_document"
    session_id: str


class ClearRequest(BaseModel):
    session_id: str


class SessionResponse(BaseModel):
    session_id: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "engines_active": len(engines)}


@app.post("/session/new")
async def new_session() -> SessionResponse:
    session_id = str(uuid.uuid4())[:8]
    get_engine(session_id)
    return SessionResponse(session_id=session_id)


@app.post("/ingest/file")
async def ingest_file(
    file: UploadFile = File(...),
    session_id: str = Form(...),
):
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

    # Save upload
    dest = UPLOAD_DIR / f"{session_id}_{file.filename}"
    content = await file.read()
    dest.write_bytes(content)

    try:
        engine = get_engine(session_id)
        stats = engine.ingest_file(str(dest))
        return {"success": True, "stats": stats}
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        dest.unlink(missing_ok=True)


@app.post("/ingest/text")
async def ingest_text(req: PasteRequest):
    if len(req.text.strip()) < 50:
        raise HTTPException(400, "Text too short (min 50 characters)")
    try:
        engine = get_engine(req.session_id)
        stats = engine.ingest_text(req.text, req.name)
        return {"success": True, "stats": stats}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/ask")
async def ask(req: AskRequest):
    """Non-streaming Q&A endpoint."""
    engine = get_engine(req.session_id)
    if not engine.is_ready:
        raise HTTPException(400, "No document indexed. Please upload a document first.")
    try:
        result = engine.ask(req.question, top_k=req.top_k)
        return {
            "answer": result["answer"],
            "sources": result["sources"],
            "tokens_used": result["tokens_used"],
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/ask/stream")
async def ask_stream(req: AskRequest):
    """Streaming Q&A — returns SSE stream."""
    engine = get_engine(req.session_id)
    if not engine.is_ready:
        raise HTTPException(400, "No document indexed.")

    async def event_stream() -> AsyncGenerator[str, None]:
        try:
            # First emit sources
            sources = engine.retrieve(req.question, top_k=req.top_k)
            sources_data = [
                {
                    "chunk_id": s["chunk_id"],
                    "source": s["source"],
                    "preview": s["preview"],
                    "score": round(s["score"], 4),
                    "chunk_index": s["chunk_index"],
                }
                for s in sources
            ]
            import json
            yield f"data: {json.dumps({'type': 'sources', 'data': sources_data})}\n\n"

            # Then stream answer tokens
            async for token in engine.ask_stream(req.question, sources):
                yield f"data: {json.dumps({'type': 'token', 'data': token})}\n\n"

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as e:
            import json
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/clear")
async def clear(req: ClearRequest):
    engine = get_engine(req.session_id)
    engine.reset()
    return {"success": True}


@app.get("/status/{session_id}")
async def status(session_id: str):
    engine = get_engine(session_id)
    return {
        "ready": engine.is_ready,
        "doc_count": engine.chunk_count,
        "sources": engine.sources,
        "history_length": len(engine.history),
    }
