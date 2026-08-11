---
type: research
branch: To-Learn-List
task: learning list intake, fixed Areas, liveness-gated lazy generation
state: draft
updated: 2026-08-07
---

# Research: learning list intake

## Facts about the current system

- Objective taxonomy already exists: `domain_nodes` (hierarchical, `source: "static_taxonomy"`),
  seeded from `apps/api/scripts/seed-data/it-taxonomy.yaml` (208 nodes, 15 domains) by
  `apps/api/scripts/seed-domain-taxonomy.ts`.
- Curricula map INTO it via `curriculum_domain_node_mappings` (many-to-many; `suggested` /
  `confirmed` / `rejected`; per-mapping `depth`). Hallucinated node ids are dropped by
  `partitionMappingResult` (`packages/core/src/curriculum-domain-mapping/`).
- **React, Node.js and AWS are not nodes today.** Deepest relevant node is
  `web-development → frontend-development → frontend-frameworks`, whose description string
  merely mentions "React, Vue, Angular".
- Cross-cutting concerns are a **fixed 6-enum** (`packages/shared/src/concern.ts`:
  security, performance, observability, cost, reliability, developer_experience) — attached
  **only** to `gaps.concern`. Nothing at curriculum, topic or node level.
- Depth ladder already exists: `awareness | working | deep`, on `topics.depth`, `gaps.depth`,
  `domain_nodes.targetDepth`, `curriculum_domain_node_mappings.depth`, `curricula.defaultDepth`.
- Activity is already recorded: `topics.progressLastInteractedAt`, `topics.progressAttempts`,
  `gap_mastery` (per-gap stage, correct/incorrect counts, `lastCorrectSessionId`).
- Nudge delivery already exists: `/daily-push` (`packages/core/src/curriculum/daily-push.ts`)
  and the Telegram bot.
- Polymorphic-assignment precedent already exists: `tag_assignments`, `node_feedback`,
  `study_item_feedback` all use (`nodeType`/`itemType`, `nodeId`/`itemId`).
- **Questions are not a schema unit.** Questions are generated at probe time from `gaps` under
  `topics`. Any "N questions" target must be planned as topics/gaps that *yield* N.

## Facts about the AWS example (fetched 2026-08-07)

- `docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-security/introduction.html`
  states verbatim: *"This guide is part of a series about agentic AI on AWS."*
- The series landing page lists **9 sibling guides**: Operationalizing, Foundations, Economics,
  Patterns and workflows, Frameworks/protocols/tools, **Security**, Governing and architecting,
  Serverless architectures, Multi-tenant architectures.
- So the link is a series **twice over**: a multi-page guide, inside a 9-guide series.
- The guide itself maps its practices to the OWASP Top 10 for LLM Applications.

## Prior art

| System | What it does | What post-anki takes / rejects |
|---|---|---|
| [Readwise](https://readwise.io/) + [Reader](https://blog.readwise.io/adding-intention-to-spaced-repetition/) | Highlights auto-flow into a daily spaced-repetition queue; Ghostreader generates flashcards from them. Uses a **recall-probability half-life** decay (7 / 14 / 28-day half-lives), not a date schedule. | **Take** the decaying-score shape for liveness. **Reject** the semantics — Readwise decays *memory*; post-anki's liveness decays *interest*. Different signal, different consequence (memory decay → resurface; interest decay → stop generating). |
| [OpenTutor](https://github.com/zijinz456/OpenTutor) | Self-hosted; upload material → notes, quizzes, flashcards; FSRS scheduler; extracts concepts and **builds a knowledge graph** from the material. | Closest full-stack analogue. **Reject** its graph direction — it builds the taxonomy *from* content, which is exactly the inverted model post-anki deliberately abandoned in #82/#84. Generates everything up front; no cost gate. |
| [Khan Academy Knowledge Map](https://support.khanacademy.org/hc/en-us/community/posts/360027982751-What-happened-to-the-knowledge-map-) | Prerequisite skill-tree visualization over a fixed curriculum. **Retired** — most learners preferred linear course progression. | Cautionary. Keeps Areas **structural** (a routing target) rather than the primary UI. Corroborates the existing `.planning/TODO.md` wishlist item asking for a dashboard with no taxonomy view. |
| MOOC stopout / abandonment prediction ([arXiv 1408.3382](https://arxiv.org/pdf/1408.3382), [arXiv 1707.04291](https://arxiv.org/pdf/1707.04291)) | Predicts learner dropout from activity features. | Confirms activity-decay is a studied signal. **Reject** the batch-ML approach — an explicit decay function plus a user-confirmed nudge is the honest version at n=1, and is inspectable. |

**Gap nobody fills:** every tool above generates the full question set on ingest. None gates
generation on measured interest. That cost gate is this feature's actual reason to exist.

## Open questions

None outstanding — all four Phase-1 forks and both Phase-2 forks were resolved with the user
(see `spec.md` → Decisions).
