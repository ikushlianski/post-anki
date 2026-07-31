---
type: plan
scope: usability-verification
state: draft
updated: 2026-07-31
---

# PostAnki usability plan

## Framing

The ask for this session: before relying on PostAnki day to day, a set of core flows need to be
*verifiably* easy and fast — not just present. The deliverable is Playwright tests that assert
usability bars (click counts, time-to-first-question, "does the system suggest the right next
thing"), not just that a button works.

Research against the current codebase (`docs/architecture/`, `.planning/wishlist.md`, open GitHub
issues) found that **most of the content-generation and study machinery described below already
exists** — curriculum creation, doc-driven intake, adaptive probing, Socratic sessions, trivia
batches, lecture mode, and a custom mastery/spaced-repetition system are all shipped. What's
**missing** is mostly around *manual control over prioritization* (drag-and-drop, quick "what's
most relevant right now" surfacing) and a few known review gaps in existing merge/practice
features.

**Two platforms, different jobs.** Web (`apps/web`) owns all course/curriculum management —
creation, merge/split, reordering. Mobile (`apps/mobile`) today is a study/consumption surface
only: `apps/mobile/src/study/` and `practice/` answer due questions and phrases, with no
curriculum-management UI at all. That split is already the right one architecturally — course
structuring is a sit-down task, quick study is a pocket task — so tickets below are tagged with
which platform(s) they apply to rather than assuming everything needs to exist on both.

Each ticket below is tagged with a status so build work isn't confused with test-writing work:

- **TEST** — feature exists and looks mature; the work is writing/hardening a Playwright usability
  test against it, and fixing whatever the test finds.
- **FIX** — feature exists but has a known, already-documented defect that blocks it from being a
  usability guarantee; fix precedes the usability test.
- **BUILD** — capability doesn't exist yet; a usability test can't be written until it's built.
- **CONFIRM→BUILD** — unclear from code whether the exact UX described exists; first confirm, then
  treat as BUILD or TEST accordingly.

No individual ticket is planned in depth here — each becomes its own `/plan-ie` (or
`/plan-playwright`) pass when picked up.

---

## Ticket 1 — Frictionless course creation

**Platform:** Web only — creation is a sit-down task, not a pocket one.

**Status:** TEST. Doc-link intake (`docs/architecture/doc-link-technology-intake.md`) and
use-case study mode already let you name a subject, paste a docs link, pick a level, and get an
AI-generated curriculum breakdown into modules/topics.

**Usability bar:** from "I want to learn Turbo Puffer" to a curriculum with modules/topics and
priorities assigned, in one form submission plus one AI wait — no more than a handful of fields,
no mandatory pre-quiz.

**Why:** this is the entry point for every other flow below; if it's not fast, nothing else
matters.

**Scope:** Playwright test walking subject → curriculum-with-docs-link → generated
modules/topics, asserting field count and no forced upfront questioning.

---

## Ticket 2 — Course merge, then split

**Platform:** Web only.

**Status:** FIX + BUILD — both already tracked as open wishlist items, not new discoveries: "Make
`clearCurriculumStructure` provenance-aware..." (data-loss fix) and "Add split (subject/course/tag)
as the fast-follow to the merge-only ontology management..." (issue #56 scope). Merge is shipped
(`docs/architecture/curriculum-merge/`) but its architecture review verdict is
**critical-issue-found**: `clearCurriculumStructure` deletes modules/topics with no provenance
check, so retrying research on a curriculum that just absorbed another one's structure can wipe
merged-in data with no warning. Split does not exist yet.

**Usability bar:** merging two courses must not silently destroy data; splitting a course must be
as low-friction as merging is today.

**Why:** ontology cleanup (fixing a bad initial split, or undoing an over-eager merge) needs to be
a routine action, not a risky one.

**Scope:** fix the provenance gap in `clearCurriculumStructure` first (small, already scoped in
the review), then plan split as its own ticket referencing issue #56. Usability tests for both once
built/fixed.

---

## Ticket 3 — Course-level priority reordering with manual drag-and-drop override

**Platform:** Web only — drag-and-drop reordering across a full course list needs the screen real
estate. Mobile consumes the resulting order (Ticket 6) rather than editing it directly, at least
initially; a lightweight mobile override (e.g. "bump to top") can be considered later once the web
version proves the model.

**Status:** BUILD. No drag-and-drop library exists anywhere in `apps/web`, and no curriculum-list
reordering UI was found. Today, priority work only exists at the domain/topic level
(`domain-priority-review`), not across courses.

**Usability bar:** reorder the priority of courses by dragging, in under a few seconds, no
confirmation dialog.

**Why:** this is the mechanism for "I need to switch attention to something else today" — without
it, re-prioritizing is either not possible or requires digging into settings.

**Scope:** new UI (course list + drag handle), new priority field/ordering on the backend if one
doesn't already exist at the course level. Usability test asserts drag reorder persists and
reflects immediately elsewhere (e.g. quick-session surfacing in Ticket 6).

---

## Ticket 4 — Module/topic re-ranking, upgraded to drag-and-drop

**Platform:** Web only, same reasoning as Ticket 3.

**Status:** TEST, with an optional UPGRADE. Re-ranking already exists and is mature
(`topic-ordering-importance.md`, `domain-priority-review.md`) — but it's promote/demote buttons
and AI-agent-driven review, not drag-and-drop.

**Usability bar:** re-ranking a module/topic should feel as fast as Ticket 3's course-level drag.

**Why:** consistency — if courses get drag-and-drop reordering, modules/topics inside a course
should work the same way rather than teaching two different interaction patterns.

**Scope:** usability test against the existing button/AI-review flow first, to establish a
baseline; decide whether to add drag-and-drop here only after Ticket 3 ships and the pattern is
proven.

---

## Ticket 5 — "What should I refocus on" cross-course suggestions

**Platform:** Both. The suggestion itself is a backend/priority-model concern; it should surface
as a banner on web (where a reorder can be acted on immediately) and as the ranking signal behind
mobile's quick session (Ticket 6), so a shift in priority shows up wherever the user next opens the
app.

**Status:** BUILD. `domain-priority-review` does AI-driven re-prioritization *within* a domain map,
but nothing surfaces "you've been ignoring Course X, and Course Y just became urgent" across
courses.

**Usability bar:** on opening the app, if priorities have meaningfully shifted (a course gone
stale, a new high-priority item added), the system should surface a suggestion — not require the
user to notice and reorder manually every time.

**Why:** this is the direct answer to "one day I want to learn X, the next day I need to switch
attention to Y" — the system should notice, not just allow manual reordering.

**Scope:** depends on Ticket 3's course-level priority model existing first. Define what "stale" or
"shifted" means, then a lightweight suggestion surface (banner, not a blocking flow).

---

## Ticket 6 — Quick session: "I have 5 minutes"

**Platform:** Both, mobile-primary. This is the exact scenario mobile exists for — pull the phone
out, tap once, answer something real. Web should support the same shortcut for anyone at a desk who
doesn't want to navigate to a specific course either. Mobile's existing daily-push subject picker
(`.planning/mobile-study-loop/`, issue #66 — surfaces what's due across subjects already) is close
prior art and the natural home for this, not a separate screen.

**Status:** BUILD. No matches anywhere for a single-most-relevant-item surfacing flow.

**Usability bar:** open the app, tap once (at most twice), and land directly on the single most
relevant question/card/topic — no menu-diving.

**Why:** this is the core "usability before I can start using the app" requirement — the whole
point of automatic prioritization is that it pays off in a near-zero-effort entry point.

**Scope:** depends on Ticket 3 (course priority) and existing per-topic priority data. New
lightweight endpoint + landing view that picks the top-ranked due item across all courses.

---

## Ticket 7 — Adaptive question generation for a new/switched-to course

**Platform:** Both — starting a course happens on web, but the adaptive question stream itself is
answered wherever the user is (`apps/mobile/src/study/question-view.tsx` already renders probe/quiz
questions). Test both surfaces consume the same adaptive behavior correctly, not just the backend.

**Status:** TEST. Probe-session (`apps/api/src/probe-session/`) already generates a small batch
first and is designed to adjust — this matches the "don't pre-generate everything, adjust after
question 3-4" requirement almost exactly.

**Usability bar:** starting a fresh course produces an initial batch (not the whole curriculum's
worth) of questions, and later questions visibly adapt to answers already given.

**Why:** confirms the adaptive design actually behaves as intended, not just that it's
architecturally capable of it.

**Scope:** usability test that answers a small batch correctly vs. incorrectly and asserts the
next batch's difficulty/topic mix shifts accordingly.

---

## Ticket 8 — Trivia/quiz question quality and randomization

**Platform:** Both. `apps/mobile/src/practice/phrase-view.tsx` already renders this content.

**Status:** TEST (corrected). The `english-batch-practice` fallback-read-path bug this ticket
originally flagged was already fixed and merged on 2026-07-28 (`235f112`, wishlist: "Fix
batch-practice's no-fallback dependency on Electric sync" — `[x]` done) — the review doc I read
during planning was stale and hadn't been updated with the fix's verdict. No FIX work remains
here.

**Usability bar:** quiz questions are minimal-code / concept-first as specified, option order is
randomized per attempt, and generation never leaves the learner with a stuck blank screen.

**Why:** this is the most-used surface day to day; a stall here is the single worst usability
failure the user described — already addressed, this ticket now just verifies it stays that way.

**Scope:** usability test covering randomization and a simulated slow-sync scenario, asserting the
existing fallback still holds.

---

## Ticket 9 — Socratic self-grading (difficult / not easy / easy / super easy) + Anki-style treatment

**Platform:** Both — self-grading and the resulting spaced-repetition schedule need to behave
identically wherever a card is answered, since the same mastery state is shared across surfaces.

**Status:** CONFIRM→BUILD. `probe-session.map.ts` has a difficulty field for question generation,
but no confirmed learner-facing self-grade scale matching the four-point scheme described. The
underlying mastery/spaced-repetition mechanism exists (custom, not named SM2/FSRS) and already
generalizes across subjects.

**Usability bar:** after a free-form Socratic question, the learner self-grades on the four-point
scale, and that grade visibly feeds the existing mastery/spaced-repetition schedule, mixed into
the same course as other card types.

**Why:** this is the mechanism that makes the app "Anki-style" rather than just a quiz app — it's
the retention engine.

**Scope:** confirm current self-grade UX directly against this spec first (cheap); only plan
new UI/schema work for the parts that are actually missing.

---

## Ticket 10 — Documentation digest → quiz → Socratic tie-together

**Platform:** Web primary for the lecture/digest reading itself (longer-form content fits a bigger
screen better); the quiz and Socratic legs can run on either, consistent with Tickets 7-9.

**Status:** TEST. Lecture mode is shipped and marked done in the wishlist; decide-mode and
learning-map-chat provide the "sophisticated," use-case/pitfall/best-practice style Socratic
follow-up.

**Usability bar:** short lecture → immediate quiz (either style) → on-demand switch into a deeper
Socratic conversation that references use cases/pitfalls/best practices, not just trivia recall.

**Why:** this is the full learning-progression loop the user described — concepts first, then
retention, then synthesis — and it's the one most already built, so it's the cheapest ticket to
verify end to end.

**Scope:** usability test walking the full digest → quiz → Socratic handoff in one session.

---

## Ticket 11 — Mobile/web functional parity

**Platform:** Mobile (the gap to close), reading from web's implementation as the source of truth.

**Status:** BUILD — a deliberate reversal of an earlier scoping decision, not a gap that was
missed. Mobile's original build (`.planning/wishlist.md`, issue #66) explicitly scoped itself to
"the core study/review flow, not full feature parity with the web app." That trade-off is being
revisited now: course management should eventually work from the phone too, not stay a
web-only surface forever.

**Usability bar:** a learner can create, merge, split, and reorder the priority of courses from
the mobile app, using the same underlying data and rules as web — not a separate, simplified
model bolted on afterward.

**Why:** the whole premise of Tickets 3, 5, and 6 (drag-and-drop priority, refocus suggestions,
quick session) is that re-prioritizing attention should be nearly effortless — that only holds if
it's available wherever the learner actually is, and per the user's own framing, that's often the
phone, not a desk.

**Scope:** explicitly sequenced *after* Tickets 2, 3, and 5 land and prove out on web — porting a
still-changing flow to a second platform means redoing the work. `apps/mobile/src/` today has
only `study/`, `practice/`, and `subject/` — no curriculum-management UI exists there at all, so
this is new mobile screens consuming the same API contracts web already uses, not a rewrite of
what's there.

## Cross-cutting notes

- Tickets 3, 5, and 6 are sequential (priority model → suggestion surface → quick-session
  consumer) — plan and build in that order, not in parallel.
- Playwright tests for all of the above land in `verification-repo/projects/post-anki/`, per
  `e2e/README.md`'s existing convention (not in this repo directly).
- Ticket 2 carries a pre-existing critical-issue-found review verdict — treat the fix as in-scope
  for the ticket, not a separate cleanup task, since a usability test written against a
  known-broken flow would just be testing the bug. (Ticket 8's equivalent bug was already fixed
  before this plan was written — see its corrected status above.)
- Ticket 11 (mobile parity) is deliberately last in the build order — it depends on Tickets 2, 3,
  and 5 being solid on web first.

## Implementation queue (missing pieces only — /grand-loop, 2026-07-31)

Started 2026-07-31 at the user's request, scoped to the BUILD/FIX/CONFIRM→BUILD tickets only (the
TEST-only tickets are usability-test-writing work for later, once the app itself is caught up).
Order follows the dependency chain above; the two items already tracked in `.planning/wishlist.md`
were moved to the top of that file rather than duplicated. Each item below is its own
`/plan-ie` + `/moonshine` pass, one at a time:

1. Ticket 2 (fix) — `clearCurriculumStructure` provenance safety.
2. Ticket 3 — course-level priority reordering + drag-and-drop.
3. Ticket 5 — cross-course refocus suggestions (needs #2 above).
4. Ticket 6 — quick session (needs #2, #3 above).
5. Ticket 2 (build) — ontology split fast-follow.
6. Ticket 9 — confirm/build Socratic self-grade scale.
7. Ticket 11 — mobile/web parity (needs #1, #2, #5 above proven on web first).

Progress is tracked in `.planning/wishlist.md` (checkbox state) and `.planning/LOG.md` (build
record per item), not duplicated here — this list is the ordering rationale, not the live status.
