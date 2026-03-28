"""
rag_engine.py — Core RAG pipeline
ChromaDB (local) for vector storage + Claude API for generation
"""

import os
import re
import uuid
import hashlib
from pathlib import Path
from typing import AsyncGenerator, Optional

import chromadb
from chromadb.utils import embedding_functions
import anthropic

try:
    import PyPDF2
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False


# ── Text Loading ──────────────────────────────────────────────────────────────
class DocumentLoader:
    def load(self, path: str) -> tuple[str, str]:
        """Returns (text, filename)."""
        p = Path(path)
        ext = p.suffix.lower()
        if ext == ".pdf":
            return self._load_pdf(p), p.name
        return p.read_text(encoding="utf-8", errors="ignore"), p.name

    def _load_pdf(self, path: Path) -> str:
        if not PDF_SUPPORT:
            raise ImportError("Install PyPDF2: pip install PyPDF2")
        parts = []
        with open(path, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            for i, page in enumerate(reader.pages):
                text = page.extract_text() or ""
                if text.strip():
                    parts.append(f"[Page {i+1}]\n{text.strip()}")
        return "\n\n".join(parts)


# ── Chunker ───────────────────────────────────────────────────────────────────
class TextChunker:
    def __init__(self, chunk_size: int = 600, overlap: int = 100):
        self.chunk_size = chunk_size
        self.overlap = overlap

    def chunk(self, text: str, source: str) -> list[dict]:
        text = re.sub(r"\r\n", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

        chunks = []
        current = ""
        page = 1

        for para in paragraphs:
            m = re.match(r"\[Page (\d+)\]", para)
            if m:
                page = int(m.group(1))
                para = para[m.end():].strip()
                if not para:
                    continue

            if len(current) + len(para) > self.chunk_size and current:
                chunks.append(self._make(current, source, page, len(chunks)))
                current = current[-self.overlap:] + "\n\n" + para
            else:
                current = (current + "\n\n" + para).strip() if current else para

        if current.strip():
            chunks.append(self._make(current, source, page, len(chunks)))

        # Split oversized chunks by sentences
        result = []
        for c in chunks:
            if len(c["text"]) > self.chunk_size * 2:
                result.extend(self._sentence_split(c))
            else:
                result.append(c)

        return result

    def _make(self, text: str, source: str, page: int, idx: int) -> dict:
        cid = hashlib.md5(f"{source}:{idx}:{text[:40]}".encode()).hexdigest()[:16]
        return {
            "id": cid,
            "text": text.strip(),
            "source": source,
            "page": page,
            "chunk_index": idx,
        }

    def _sentence_split(self, chunk: dict) -> list[dict]:
        sentences = re.split(r"(?<=[.!?])\s+", chunk["text"])
        result, current, sub = [], "", 0
        for s in sentences:
            if len(current) + len(s) > self.chunk_size and current:
                result.append(self._make(current, chunk["source"], chunk["page"],
                                         chunk["chunk_index"] * 1000 + sub))
                current = current[-self.overlap:] + " " + s
                sub += 1
            else:
                current = (current + " " + s).strip() if current else s
        if current:
            result.append(self._make(current, chunk["source"], chunk["page"],
                                      chunk["chunk_index"] * 1000 + sub))
        return result


# ── RAG Engine ────────────────────────────────────────────────────────────────
class RAGEngine:
    def __init__(self, session_id: str = "default", chroma_path: str = "./chroma_db"):
        self.session_id = session_id
        self.loader = DocumentLoader()
        self.chunker = TextChunker()
        self.history: list[dict] = []

        # ChromaDB client (local persistent)
        self.chroma = chromadb.PersistentClient(path=chroma_path)

        # Use ChromaDB's built-in sentence-transformers embedding
        # Falls back to default all-MiniLM-L6-v2 (downloads on first use ~80MB)
        self.ef = embedding_functions.DefaultEmbeddingFunction()

        # Collection per session
        self.collection = self.chroma.get_or_create_collection(
            name=f"session_{session_id}",
            embedding_function=self.ef,
            metadata={"hnsw:space": "cosine"},
        )

        # Claude client
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable not set")
        self.claude = anthropic.Anthropic(api_key=api_key)
        self.model = "claude-sonnet-4-20250514"

    # ── Ingestion ──────────────────────────────────────────────────────────
    def ingest_file(self, path: str) -> dict:
        text, filename = self.loader.load(path)
        return self._ingest(text, filename)

    def ingest_text(self, text: str, name: str = "document") -> dict:
        return self._ingest(text, name)

    def _ingest(self, text: str, source: str) -> dict:
        if not text.strip():
            raise ValueError("Document is empty.")

        chunks = self.chunker.chunk(text, source)
        if not chunks:
            raise ValueError("No chunks extracted.")

        # Clear existing docs for this source in the collection
        try:
            existing = self.collection.get(where={"source": source})
            if existing["ids"]:
                self.collection.delete(ids=existing["ids"])
        except Exception:
            pass

        # Add chunks to ChromaDB
        self.collection.add(
            ids=[c["id"] for c in chunks],
            documents=[c["text"] for c in chunks],
            metadatas=[{
                "source": c["source"],
                "page": c["page"],
                "chunk_index": c["chunk_index"],
            } for c in chunks],
        )

        return {
            "source": source,
            "chunks": len(chunks),
            "characters": len(text),
            "words": len(text.split()),
        }

    # ── Retrieval ──────────────────────────────────────────────────────────
    def retrieve(self, query: str, top_k: int = 5) -> list[dict]:
        results = self.collection.query(
            query_texts=[query],
            n_results=min(top_k, self.collection.count()),
            include=["documents", "metadatas", "distances"],
        )

        if not results["ids"][0]:
            return []

        retrieved = []
        for i, doc_id in enumerate(results["ids"][0]):
            text = results["documents"][0][i]
            meta = results["metadatas"][0][i]
            distance = results["distances"][0][i]
            score = max(0.0, 1.0 - distance)  # cosine similarity from distance

            retrieved.append({
                "chunk_id": doc_id,
                "text": text,
                "source": meta.get("source", "unknown"),
                "page": meta.get("page", 0),
                "chunk_index": meta.get("chunk_index", 0),
                "score": score,
                "preview": text[:140].replace("\n", " ") + ("..." if len(text) > 140 else ""),
            })

        return retrieved

    # ── Generation ─────────────────────────────────────────────────────────
    def ask(self, question: str, top_k: int = 5) -> dict:
        sources = self.retrieve(question, top_k)
        if not sources:
            return {
                "answer": "I couldn't find relevant information in the document.",
                "sources": [],
                "tokens_used": 0,
            }

        context = self._build_context(sources)
        messages = self._build_messages(question, context)

        response = self.claude.messages.create(
            model=self.model,
            max_tokens=1200,
            system=self._system_prompt(),
            messages=messages,
        )

        answer = response.content[0].text
        tokens = response.usage.input_tokens + response.usage.output_tokens

        self._update_history(question, answer)

        return {"answer": answer, "sources": sources, "tokens_used": tokens}

    async def ask_stream(self, question: str, sources: list[dict]) -> AsyncGenerator[str, None]:
        """Async streaming generation using Claude's streaming API."""
        context = self._build_context(sources)
        messages = self._build_messages(question, context)

        with self.claude.messages.stream(
            model=self.model,
            max_tokens=1200,
            system=self._system_prompt(),
            messages=messages,
        ) as stream:
            full_answer = ""
            for text in stream.text_stream:
                full_answer += text
                yield text

        self._update_history(question, full_answer)

    # ── Helpers ────────────────────────────────────────────────────────────
    def _system_prompt(self) -> str:
        return """You are DocMind, a precise document Q&A assistant.

Rules:
- Answer ONLY based on the provided document context
- Cite sources inline as [Source N] when referencing specific information
- If the context doesn't contain the answer, say: "This information isn't available in the document."
- Be concise but complete. Use bullet points for multi-part answers.
- Never fabricate information. Never guess."""

    def _build_context(self, sources: list[dict]) -> str:
        parts = []
        for i, s in enumerate(sources, 1):
            parts.append(
                f"[Source {i}] {s['source']} (chunk {s['chunk_index']}, relevance {s['score']:.2f})\n{s['text']}"
            )
        return "\n\n---\n\n".join(parts)

    def _build_messages(self, question: str, context: str) -> list[dict]:
        messages = list(self.history[-4:])  # last 2 Q&A turns
        messages.append({
            "role": "user",
            "content": f"Document context:\n\n{context}\n\nQuestion: {question}",
        })
        return messages

    def _update_history(self, question: str, answer: str):
        self.history.append({"role": "user", "content": f"Q: {question}"})
        self.history.append({"role": "assistant", "content": answer})
        if len(self.history) > 20:
            self.history = self.history[-20:]

    # ── State ──────────────────────────────────────────────────────────────
    def reset(self):
        try:
            self.chroma.delete_collection(f"session_{self.session_id}")
            self.collection = self.chroma.get_or_create_collection(
                name=f"session_{self.session_id}",
                embedding_function=self.ef,
                metadata={"hnsw:space": "cosine"},
            )
        except Exception:
            pass
        self.history = []

    @property
    def is_ready(self) -> bool:
        try:
            return self.collection.count() > 0
        except Exception:
            return False

    @property
    def chunk_count(self) -> int:
        try:
            return self.collection.count()
        except Exception:
            return 0

    @property
    def sources(self) -> list[str]:
        try:
            results = self.collection.get(include=["metadatas"])
            return list({m["source"] for m in results["metadatas"]})
        except Exception:
            return []
