# maistorage-task

## Overview
MaiStorage R&D chat interview task: a lightweight FastAPI + Next.js streaming chat app with database-backed memory, project-scoped semantic RAG, and Docker deployment.

## Stack
FastAPI, SQLAlchemy, SQLite, Next.js, React, TypeScript, Docker Compose, Gemini API

## Core Value
Demonstrates a production-shaped LLM chat system without heavyweight local infrastructure: token streaming, persisted chat sessions, shared project sources, semantic retrieval, citations, and a polished browser UI.

## Constraints
Must run comfortably on a laptop and inside Docker. RAG uses SQLite-stored JSON vectors and Gemini embeddings when available, with keyword fallback for offline/keyless demos.

## Architecture
FastAPI owns sessions, projects, source ingestion, RAG retrieval, and SSE streaming. Next.js owns the chat and notebook-style project workspace. Docker Compose runs frontend and backend, with SQLite persisted in a named volume.
