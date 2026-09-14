---
type: plan
branch: learn-from-doc-site
task: ai-chat-panel
complexity: complex
state: draft
updated: 2026-09-12
---

# AI chat panel with web-search Q&A and sub-topic suggestions

## What and why

GitHub issue #94 / `.planning/factory-todo.md`'s two open lines: a learner should be able to
ask an AI a question from anywhere in the app (grounded in the current topic/curriculum when
one is in view) and get sub-topic suggestions to grow their course with, without leaving the
page. Today the only chat surface is `study-chat-sidebar.tsx`, embedded on one curriculum page
and scoped to that topic only — there is nothing app-wide.

This is two root backlog items sharing one feature; they are implemented as two separate
phase lists (see "Coding tasks" below) so `select-next` never dispatches the same phase twice.

## Scope boundary (non-negotiable)

Natural-language move/merge/split/rename of *confirmed* course content is out of scope — that's
the deliberately blocked `chat-driven-reorganization` direction, pending a product decision on
"how does the app decide which existing content goes where" (`.planning/TODO.md`, "Decisions to
make"). `structure-editor.agent.ts`/`structure-editor-tools.ts` already do add/remove/rename/
merge/promote/split, but only against an in-memory DRAFT snapshot before `confirm-structure`
ever writes it — that precedent does not license the same tools against live, already-confirmed
`modules`/`topics`. Every tool this feature adds is one of:
- **Read-only** — answer a question, suggest sub-topics as plain text/data, cite sources.
- **Narrowly additive with explicit human confirmation in the UI** — "add this as a new topic
  under module X" only fires after the learner clicks an explicit button; the agent itself never
  calls a tool that writes to `modules`/`topics`.

## Phases — root A: "Add AI Q&A with web search on curriculum topics, suggesting sub-topics."

Backend-only; foundational for root B.

### Phase 1: Q&A endpoint and tool-calling agent
Goal: a new endpoint answers a free-text question, optionally grounded in a topic/curriculum,
using a new Mastra agent registered in `mastra.ts`/`AGENT_KEYS`. Model the agent on
`structure-editor.agent.ts`'s dynamic-tools-from-`requestContext` shape (the one tool-calling
precedent in this codebase) — never Mastra's `clientTools` (that mechanism strips `execute`
before sending to the model; wrong for server-executed tools). All LLM calls go through
`generate-with-retry.ts`, no exceptions — this session just extended that wrapper to every other
call site in the app; a bare `agent.generate()` here would be the one hole left.
Key files: `apps/api/src/mastra/qa-chat.agent.ts` (new), `apps/api/src/mastra/mastra.ts`
(register), `apps/api/src/qa-chat/qa-chat.service.ts` + `.controller.ts` (new, modeled on
`study-chat.service.ts`/`study-chat.controller.ts`), `packages/shared/src/qa-chat.ts` (new
input/result schemas), `apps/api/src/server.ts` + `router-table.ts` (route wiring).

### Phase 2: sub-topic suggestion tool (read-only)
Goal: one tool the agent can call that returns suggested sub-topic titles + one-line rationale
for the curriculum/module currently in context — data only, no DB write. The FE (root B, Phase 2)
is what turns an accepted suggestion into a real `createTopic` call, with the learner's explicit
click as the confirmation step. Key files: `apps/api/src/mastra/qa-chat-tools.ts` (new) — a
`suggestSubtopics` tool reading existing curriculum/module/topic context via
`apps/api/src/curriculum/curriculum.repo.ts`'s existing read helpers.

### Phase 3: on-demand web search tool (cost-gated)
Goal: a second tool wrapping the existing `webSearch()` from `apps/api/src/probe/probe-grounding.ts`
— reuse it, do not reimplement the OpenRouter `web_search` call. The tool must be something the
agent *chooses* to call when a question needs current external info, never an automatic per-turn
search — `webSearch` is a paid OpenRouter call, and an always-on app-wide panel makes runaway
per-message spend a real risk without this gate. Citations returned by the tool must be filtered
through `isSafeSourceUrl` (the same guard already applied at every other citation site this
session) before reaching the reply.

## Phases — root B: "Add a draggable, tool-calling AI chat panel docked bottom-right app-wide."

Frontend-only; consumes root A's endpoint. Ephemeral panel state (no persistence) — same as
`study-chat-sidebar.tsx` today, do not add a persistence layer the existing chat doesn't have.

### Phase 1: docked draggable panel shell
Goal: a collapsible/expandable panel mounted in `apps/web/src/routes/__root.tsx` (app-wide,
survives route changes), draggable within the viewport, default docked bottom-right. Note:
`TanStackDevtools` already occupies `bottom-right` in dev mode (`__root.tsx:114-126`) — the panel
must not visually collide with it in dev (e.g. offset, or z-index + collapsed-by-default). Key
files: `apps/web/src/chat-panel/chat-panel.tsx` (new), wired into `__root.tsx`.

### Phase 2: wire panel to the Q&A endpoint + sub-topic confirmation UI
Goal: reuse `study-chat-sidebar.tsx`'s message-list/input/mutation pattern (React Query
`useMutation`, transcript array, `data-testid`s) against root A's new endpoint. Derive
route context (current `topicId`/`curriculumId` if the active route has one, via TanStack
Router's route-match hooks) and pass it along so the agent can ground its answer. When a reply
includes suggested sub-topics, render each as a card with an explicit "Add to course" button —
clicking it calls the existing `createTopic` flow directly; the agent never calls that itself.
Key files: `apps/web/src/chat-panel/chat-panel.api.ts` (new), `apps/web/src/chat-panel/
subtopic-suggestion-card.tsx` (new).

### Phase 3: tests
Goal: RTL integration test for the panel (render, ask a question, see reply, accept a
suggestion) plus a red-first Playwright scenario per
`.claude/skills/shared/e2e-conventions-personal.md` (this is user-facing work — implement-factory
Step 4 rule 3 applies). Key files: `apps/web/src/chat-panel/chat-panel.test.tsx` (new), an e2e
scenario under whatever the project's existing Playwright suite root is.

## Constraints and risks

- **Scope boundary above is the primary risk** — an implementer who only skims
  `structure-editor-tools.ts` could copy its move/merge/split tools against live content. Do not.
- **Unregistered agent = silent tracing gap.** Every other Mastra agent in this app is registered
  in `mastra.ts`'s `AGENT_KEYS`; skipping that for the new agent means no observability spans,
  not a functional break, but easy to miss.
- **Cost**: web search is opt-in-per-question by the agent, never automatic; sub-topic suggestion
  is a plain LLM call already covered by whatever tier `qa-chat` resolves to via the existing
  `resolveEffectiveModelTier` cascade — no new cost mechanism needed there.
- **No new persistence** — panel state is in-memory only, matching the existing study chat.
- Both root items can be implemented in parallel by separate subagents once root A's Phase 1
  endpoint contract (request/response shape) is decided, since root B, Phase 2 only needs that
  contract, not root A's actual running code, to build against with a stub — but to keep this
  simple, dispatch root A fully first, then root B.
