---
name: codex-web-search
description: Web search via the OpenAI Codex CLI native web_search tool, authenticated through a ChatGPT Pro/Plus subscription — no separate API key and no per-call web-search billing. Use `codex exec -c tools.web_search=true` for agentic multi-search with cited synthesis.
version: 1.0.0
author: su-record
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [search, codex, web-search, openai, chatgpt-pro]
    related_skills: [duckduckgo-search, searxng-search]
    fallback_for_toolsets: [web]
---

# Codex Web Search

Run agentic web research through the OpenAI Codex CLI built-in `web_search` tool. When the Codex CLI is authenticated via ChatGPT Pro/Plus OAuth, this uses that subscription — **no separate OpenAI API key and no per-call web-search billing.**

## When to use

- Deep, current, multi-source research where the model should search several times and synthesize a cited answer.
- You have a ChatGPT Pro/Plus subscription (Codex OAuth) but no standalone OpenAI/search API key.
- A richer, analyzed answer is preferred over a single-shot list of links.

## Prerequisites

- Codex CLI installed: `npm install -g @openai/codex`
- Codex authenticated: ChatGPT Pro/Plus OAuth (`codex login`) or `OPENAI_API_KEY`.
- Must run inside a git repository (Codex requirement). For scratch use: `D=$(mktemp -d) && cd "$D" && git init -q`.

## Usage

```bash
codex exec -c tools.web_search=true --sandbox danger-full-access \
  "<your research question>. Use web search for current info and cite source URLs." 2>/dev/null
```

- `-c tools.web_search=true` enables the native Responses `web_search` tool in non-interactive `exec` mode (the config equivalent of the interactive `--search` flag).
- `--sandbox danger-full-access` avoids sandbox/bubblewrap failures in service/gateway contexts. Rely on process boundaries instead: explicit workdir, clean git status, narrow prompt.
- **stdout is the final answer; stderr is search progress.** Use `2>/dev/null` to capture just the answer.

## Notes

- Codex performs multiple searches per query and returns a synthesized, source-cited answer (richer than one search call), but is slower (minutes) and token-heavy. Best for one-off deep research, not high-volume loops.
- For a quick keyword lookup, prefer a lightweight backend (`duckduckgo-search`, `searxng-search`, or the built-in `web_search` tool).
