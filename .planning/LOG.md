---
type: log
branch: main
task: post-anki completed work archive
state: open
updated: 2026-09-15
---
# Completed work archive

Completed (`[x]`) items folded out of `.planning/TODO.md`'s per-direction `### Coding tasks`
blocks, so those blocks stay legible as "what's left." One entry per direction.

## llm-cost-observability
- Cap chat transcripts sent to every LLM call at a bounded turn count
- Surface the new token-usage columns on the admin observability page
- Extend llm_call_events recording to the ~17 other agent.generate call sites with none
- Capture real token usage on llm_call_events for its 3 existing call sites

## discovery-and-navigation
- Tell the learner when Scan now failed, not just when it's a duplicate run
- Fix the study-session and learning-path detail pages never actually rendering
- Fix the category, priority-review, recommendations, and domain-map pages never actually rendering
- Let categories be dragged onto each other to nest, with a confirm warning.
  - Phase 1: Nest one category under another on the backend
  - Phase 2: Drag categories and curricula onto categories, with confirm
