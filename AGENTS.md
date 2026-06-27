# maistorage-task

## Project Context
- **Description:** MaiStorage task management project
- **Stack:** node

## ðŸš¨ SECURITY RULES (Always Active)
1. **NEVER** write raw API keys, tokens, or credentials to any file â€” use \[REDACTED]\
2. STATE.md must NOT contain credentials
3. Use \secret_regex.py\ for redaction: \rom secret_regex import scrub_secrets\
4. Qdrant REST API requires \pi-key\ header from \QDRANT_API_KEY\ env var

## ðŸ”„ ORCHESTRATION
### PRE-FLIGHT SYNC
- Read \.planning/STATE.md\ at session start â€” tells you current milestone and next step
- Read \graphify-out/GRAPH_REPORT.md\ for god nodes and community structure
- Sanitize STATE.md with \scrub_secrets()\ before writing

### SNIPER SPEC (One-Shot Rule)
- Write 10-15 line spec with target files + test commands + rollback plan

### MICRO-CHECKPOINTING
- Update STATE.md after every edit or test run
- Include agent identity + current line + next step

## ðŸ›¡ï¸ CAPABILITIES AVAILABLE
- **sandbox_run / sandbox_test / sandbox_build** â€” safe execution via mcp-sandbox
- **ci_trigger / ci_status / ci_logs** â€” GitHub Actions via mcp-cicd
- **scan_secrets / scan_deps / scan_sast** â€” security scanning via mcp-security
- **cost_tracker** â€” token usage monitoring

## ðŸ§  HEADROOM â€” Context Compression
- Proxy: \http://127.0.0.1:8787\
- 60-95% fewer tokens on tool outputs, RAG chunks, files, logs
- Cross-agent memory across Claude, Codex, Gemini
- \headroom learn\ auto-improves this file from failed sessions

## ðŸ”§ PONYTAIL â€” Lazy Senior Dev
Before writing code: does it need to exist? â†’ stdlib does it? â†’ native feature? â†’ installed dep? â†’ one line? â†’ minimum that works. Never cut security, validation, or error handling.

## âš¡ PERFORMANCE
- Qdrant: \http://127.0.0.1:6333\ (authenticated)
- Graph rebuild: debounced 5s (auto-detects project root)
- Scar capture: auto-detects project from git remote
- RAG indexer: incremental (unchanged files skipped)
