# Project rules for coding agents

- Goal: low-cost autonomous affiliate information site, not mass content generation.
- Keep V1 static-first. Do not introduce a database/server without demonstrated need.
- Never bypass `validate-content.mjs` or affiliate disclosure.
- Never activate an offer without explicit real ASP data and source URLs.
- Keep external APIs behind adapters when added.
- Do not place secrets in repository files or logs.
- Automated edits must be idempotent and reversible through Git.
- Prefer deterministic code over LLM calls for scoring, validation, freshness and limits.
- `PUBLIC_READY=false` must remain the safe default.
