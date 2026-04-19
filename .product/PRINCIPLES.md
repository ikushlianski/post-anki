# Principles

## User-only gap creation
Only the user creates gaps — via Fail tap or explicit "I don't know." The system never auto-logs gaps.
**Why:** Silent gap accumulation recreates Anki guilt.
**When it applies:** Every ingestion path, every Socratic session.

## Architect-level, not cramming
Every Socratic question probes WHY and how things work together — never tests recall of facts or syntax.
**Why:** Recall is Google's job; architectural reasoning is the product's job.
**When it applies:** All question generation and evaluation.

## Real-source grounding
Every discussion is anchored in the actual doc or article ingested — not hallucinated general knowledge.
**Why:** Trust erodes if the system confidently teaches wrong things.
**When it applies:** All Socratic sessions.

## Silent on non-response
If the user doesn't engage with a push or question, the system says nothing further. No guilt, no retry, no nudge.
**Why:** Any pressure recreates Anki anxiety.
**When it applies:** Push delivery, gap prompts, session endings.

## No session debt
Missed pushes are silently dropped. Next push fires at next scheduled time — no catch-up queue.
**Why:** Queued sessions feel like obligation — the Anki model this product replaces.
**When it applies:** Push scheduling and crash recovery.

## No passive maturity decay
Concept maturity only changes on interaction — it never degrades over time automatically. After 90 days without interaction, concepts get an "Unverified" visual tag — not a penalty.
**Why:** Passive decay is Anki's core guilt mechanism.
**When it applies:** All maturity scoring.

## System selects — user never manages a queue
The system chooses what to surface each day. The user responds or doesn't. There is no backlog the user is responsible for clearing.
**Why:** Queue management is cognitive overhead that killed Anki's utility.
**When it applies:** Push selection, session initiation.

## Depth caps prevent over-investment
Each tool has a maturity ceiling (architect: 50/100, practitioner: 75/100, deep: 100/100). The system stops probing beyond the user's chosen depth for that tool.
**Why:** Infinite depth investment in non-priority tools is a trap.
**When it applies:** Question selection, maturity scoring, gap logging.

## Quality over tool breadth
Depth in a few chosen tools beats shallow coverage of many. The depth cap mechanism enforces this.
**Why:** spreading thin across tools recreates the "I know a little about everything" trap.
**When it applies:** tool registration, depth-level selection, cross-cutting saturation warnings.

## Phase-gated build
Phase 2 features are built only after Phase 1 loop is demonstrably used (target: 4+ days/week for 1 month). No speculative features ahead of proven utility.
**Why:** Features built before utility is proven optimize for the wrong loop.
**When it applies:** All feature prioritization decisions after Phase 1 ships.
**Success gate:** 4+ days/week engagement for 1 month; user can articulate tradeoffs for stack tools without AI prompting.
