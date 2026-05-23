# Decisions

## [2026-04-19] — vocabulary
- Atom and Concept are the same construct — "atom" is informal shorthand; "concept" is the canonical term.

## [2026-04-19]
- Both ingestion paths ship in Phase 1 — article is the core loop, docs path is structurally parallel.
- One atom store, two parent types — same Socratic mechanics for both; splitting stores doubles the codepath.
- Cadence = daily push + on-demand only — "immediate" is redundant with on-demand.
- Gap creation is user-only, supersedes PRD "Created by AI" spec — auto-logging recreates Anki guilt.
- Paste and link ingestion produce candidate atoms only — auto-gap from paste rebuilds the debt loop.
- Deployment = local Mac Mini + Telegram bot — no cloud dependency, personal system stays self-hosted.
- Phase 2 scope = web dashboard + gap map + cross-cutting tracking + dismissed-gap nudge system — contingent on Phase 1 phase gate.
- Phase 3 scope = ecosystem scanner (GitHub/RSS for stack updates) + /decide judgment mode — contingent on Phase 2 phase gate.
