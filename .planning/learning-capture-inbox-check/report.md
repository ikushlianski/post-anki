# Learning capture inbox — verification report (issue #78)

## Verdict

**Needs planning.** No quick-capture UI for learning goals/questions exists. The existing
learning-list capture flow is link-only (article/video URL), not free-text goals or questions,
and wiring a free-text goal into it requires backend contract changes plus unanswered design
decisions about where the entry point lives and what happens to a captured goal next. Not marked
done.

## What issue #78 actually asks for

A fast, low-friction capture flow for **free-text learning goals and questions** — the examples
given are statements, not links:

- "I need to learn Kubernetes operators"
- "How do I debug async race conditions"

The stated flow: capture (simple text input/modal) → lands in an inbox/routing flow → post-anki
decides whether to add to an existing course, create a new course prep, or prep a mini-course.

## What already exists (and why it doesn't cover the ask)

A substantial learning-list module exists, but it is **URL-based capture**, not goal/question
capture:

- `apps/web/src/learning-list/capture-form.tsx:155-158` — the `Capture` submit button is
  `disabled={busy || url.trim() === '' || subjectId === ''}`. A URL is mandatory; there is no way
  to submit a bare goal statement.
- `apps/web/src/learning-list/capture-form.tsx:20-23` — the only capture kinds are `article` and
  `video`.
- `packages/shared/src/learning-list.ts:141-147` — `captureLearningListItemInput` requires
  `url: z.string().min(1)`; `packages/shared/src/learning-list.ts:99` restricts
  `learningListItemKindSchema` to `["article", "video"]`. No "goal"/"question" kind exists in the
  shared contract.
- `apps/api/src/learning-list/learning-list.controller.ts:38-69` — `handleCaptureLearningListItem`
  delegates to the link-classification orchestrator (fetch URL → source text → series verdict →
  destination). Free-text goals have no path through this pipeline.

## Where the existing capture UI is reachable from

The URL-only `CaptureForm` is embedded in two places:

- `/learning-list` route (`apps/web/src/routes/learning-list.tsx:41`), reachable only via
  Dashboard → "Learning list" widget → "View all" (`apps/web/src/home/learning-list-widget.tsx:40-46`).
- The empty-step CTA inside a learning path (`apps/web/src/learning-path/learning-path-step-row.tsx:111`),
  which itself requires navigating deep into a specific learning path.

There is **no global quick-add**: the app header has only `GlobalSearch`
(`apps/web/src/routes/__root.tsx`), and the sidebar has only a "Dashboard" link
(`apps/web/src/nav/sidebar.tsx`). No "inbox", "goal", or "question" capture surface exists
anywhere in `apps/web/src`.

## Why this is not a small bounded build

Capturing free-text goals/questions is not "one FE component reusing the existing endpoint":

1. **Data-contract change** — `captureLearningListItemInput` requires a URL, and the item kind
   enum has no `goal`/`question` value. Supporting free-text requires changing the shared Zod
   schema and the capture orchestrator, not just adding a form.
2. **Routing flow is unbuilt** — the issue's step 3 (decide: add to existing course vs. new course
   prep vs. mini-course) has no free-text analogue. The existing destination logic operates on
   parsed source text from a fetched URL.
3. **App-wide placement decision** — where the quick-add lives (header button, dashboard, floating
   action) is an open UX choice, not an obvious default.
4. **Post-capture lifecycle** — what a captured goal does next (sit in an inbox? trigger
   classification immediately?) is unspecified.

These are design decisions, not mechanical wiring.

## Open questions for planning

- Where does the quick-add entry point live app-wide (header, dashboard, sidebar)?
- What is the data model for a free-text goal/question (new item kind vs. url-nullable item)?
- What happens to a captured goal immediately after capture — does it wait in an inbox, or is it
  classified/routed right away?
- Does the issue's "routing flow" (course expansion vs. new prep vs. mini-course) get built in
  this same ticket or a follow-up?
