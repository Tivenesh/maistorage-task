# MaiStorage LLM Workspace Wireframes

## 1. App Shell

```
| command rail | main workspace / chat area                         |
|--------------|----------------------------------------------------|
| logo         | subtle storage-lane background                     |
| New Chat     | active project/chat body                           |
| Search       |                                                    |
| API Keys     | floating composer at bottom                        |
| Projects     | optional overview/status panel on wide screens     |
| Recents      |                                                    |
```

## 2. Project Workspace

```
top bar:
[Add sources]                         [3 Sources]

center:
[project icon]
Project Name
Project description

[ + Ask this project ...                         send ]

below:
Sources                                  Past chats
[runbook.md indexed]                     [Deployment rollout]
[architecture.png indexed]               [RAG smoke test]
[api-notes.txt indexed]
```

Rules:

- The project page must make shared project sources obvious.
- Source cards show file type, file name, indexed/shared status, and a short metadata line.
- Starting multiple chats from this page keeps each chat separate but binds all chats to the same project sources.

## 3. Chat Surface

```
top/empty state:
MaiStorage mark
Ask a project, codebase, or storage rollout question
[project badge] [model badge] [sources badge]

message stream:
avatar | message
avatar | assistant answer with source chips

bottom:
[chips: agent, model, project, source count]
[text input]
[model] [attach] [code] [search] [web] [orchestrate]         [voice] [send]
```

Rules:

- Composer is a floating glass capsule.
- Do not animate text during streaming.
- Source and model chips are visible before sending.

## 4. Settings/API Keys

```
modal:
left tabs: Settings / Agents / Projects
main:
Bring your own API key notice
Provider form
Saved providers with preview-only key
```

Rules:

- State clearly that a fresh clone does not contain the developer key.
- Reviewers paste their own provider key.
- The browser only receives key previews, never the full saved key.

## 5. Mobile

```
top compact rail
main project/chat surface
composer fixed at bottom
overview panel hidden
WebGL reduced/disabled
```

Rules:

- No horizontal overflow.
- Rail sections collapse into compact horizontal controls.
- Composer controls wrap cleanly.
