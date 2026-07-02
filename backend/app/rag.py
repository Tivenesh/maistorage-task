"""
Lightweight semantic retrieval (RAG) for project documents.

Design goals (interview + laptop constraints):
- No separate vector database service and no local embedding model (no PyTorch).
  Embeddings come from the Gemini API (reusing the app's key); vectors are
  stored as JSON in the existing SQLite database.
- Fully degradable: if no API key is present or an embedding call fails, callers
  fall back to keyword ranking, so tests and keyless demos still work offline.

Pipeline: chunk document -> embed chunks -> store vectors in SQLite
          -> embed query -> cosine top-k -> return chunks for grounding.
"""

import json
import logging
import math
import os
from typing import List, Optional, Tuple

from google.genai import types
from sqlalchemy.orm import Session

from . import llm
from .models import DocumentChunk, ProjectDocument

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")
EMBEDDING_DIM = 768          # reduced from the model's native 3072 to keep storage/cosine cheap
CHUNK_SIZE = 1000            # characters per chunk
CHUNK_OVERLAP = 150          # character overlap so facts on a boundary are not split away
EMBED_BATCH = 32
SEMANTIC_TOP_K = 5

# Ranked (score, chunk) pairs returned by semantic_search.
ScoredChunk = Tuple[float, DocumentChunk]


def embeddings_available() -> bool:
    """True when a Gemini key is configured; embeddings reuse the app's key."""
    return bool(llm.api_key)


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Split text into overlapping character windows. Deterministic and dependency-free."""
    text = (text or "").strip()
    if not text:
        return []
    if len(text) <= size:
        return [text]

    step = max(size - overlap, 1)
    chunks: List[str] = []
    for start in range(0, len(text), step):
        piece = text[start:start + size].strip()
        if piece:
            chunks.append(piece)
        if start + size >= len(text):
            break
    return chunks


def embed_texts(texts: List[str], task_type: str = "RETRIEVAL_DOCUMENT") -> Optional[List[List[float]]]:
    """
    Embed texts via Gemini. Returns None (not an exception) when embeddings are
    unavailable or the call fails, so callers can fall back to keyword retrieval.
    task_type is RETRIEVAL_DOCUMENT for stored chunks and RETRIEVAL_QUERY for the
    live query, which improves asymmetric retrieval quality.
    """
    if not llm.api_key or not texts:
        return None
    try:
        client = llm._get_client()
        vectors: List[List[float]] = []
        for start in range(0, len(texts), EMBED_BATCH):
            batch = texts[start:start + EMBED_BATCH]
            response = client.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=batch,
                config=types.EmbedContentConfig(
                    output_dimensionality=EMBEDDING_DIM,
                    task_type=task_type,
                ),
            )
            vectors.extend([list(item.values) for item in response.embeddings])
        return vectors
    except Exception as exc:
        logger.warning("Embedding call failed (%s); falling back to keyword retrieval.", exc)
        return None


def cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = norm_a = norm_b = 0.0
    for x, y in zip(a, b):
        dot += x * y
        norm_a += x * x
        norm_b += y * y
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / math.sqrt(norm_a * norm_b)


def index_document(db: Session, document: ProjectDocument) -> int:
    """Chunk, embed, and store a document's vectors. Returns the chunk count (0 if not indexed)."""
    chunks = chunk_text(document.content)
    if not chunks:
        return 0
    vectors = embed_texts(chunks, task_type="RETRIEVAL_DOCUMENT")
    if not vectors:
        return 0

    db.query(DocumentChunk).filter(DocumentChunk.document_id == document.id).delete()
    for index, (chunk, vector) in enumerate(zip(chunks, vectors)):
        db.add(DocumentChunk(
            document_id=document.id,
            project_id=document.project_id,
            chunk_index=index,
            content=chunk,
            embedding=json.dumps(vector),
        ))
    db.commit()
    return len(chunks)


def ensure_project_indexed(db: Session, project_id: str) -> int:
    """Lazily index any documents in the project that have no chunks yet (e.g. uploaded before RAG existed)."""
    documents = db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id).all()
    indexed = 0
    for document in documents:
        already = db.query(DocumentChunk.id).filter(DocumentChunk.document_id == document.id).first()
        if not already:
            indexed += index_document(db, document)
    return indexed


def reindex_project(db: Session, project_id: str) -> int:
    """Drop and rebuild all chunks for a project. Returns the number of chunks written."""
    db.query(DocumentChunk).filter(DocumentChunk.project_id == project_id).delete()
    db.commit()
    return ensure_project_indexed(db, project_id)


def semantic_search(db: Session, project_id: str, query: str, top_k: int = SEMANTIC_TOP_K) -> Optional[List[ScoredChunk]]:
    """
    Return the top-k most relevant chunks for the query, or None to signal the
    caller to fall back to keyword retrieval (no key, no chunks, or embed failure).
    """
    if not embeddings_available():
        return None

    ensure_project_indexed(db, project_id)
    rows = db.query(DocumentChunk).filter(DocumentChunk.project_id == project_id).all()
    if not rows:
        return None

    query_vectors = embed_texts([query], task_type="RETRIEVAL_QUERY")
    if not query_vectors:
        return None
    query_vector = query_vectors[0]

    scored: List[ScoredChunk] = []
    for row in rows:
        try:
            vector = json.loads(row.embedding)
        except (ValueError, TypeError):
            continue
        scored.append((cosine_similarity(query_vector, vector), row))

    scored.sort(key=lambda item: item[0], reverse=True)
    return scored[:top_k]
