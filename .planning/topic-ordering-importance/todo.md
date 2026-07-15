---
type: todo
branch: topic-ordering-importance
task: Promote/demote modules and topics, per-node comments, and AI-decided strict document order
state: open
updated: 2026-07-15
---
# Todo: Topic ordering & importance

## Decisions to make
Nothing to decide — every fork encountered during planning was resolved autonomously with a
logged default (`spec.md`'s "Decisions made autonomously", 10 items). Listed below purely for
morning sanity-check, not because anything is blocked.

## To review / clarify
- Real dependency for a plan not built here: the parallel recommendation-engine plan (personal-
  learning-map chat + stats dashboard + streaks) should read `Topic.priority`/`Module.priority` as
  a boost/tiebreak input to whatever replaces or extends `recommendedTopicId`. This plan only
  exposes the field — it does not touch `packages/core/src/curriculum/recommendation.ts`. Flag
  this dependency to whoever picks up that plan next.
- One interpretive call worth a deliberate look: `strict_order` is a single whole-curriculum
  boolean, not per-module. If a technology's docs are step-by-step for its "basics" module but
  reference-style for an "advanced" module, this plan can't express that split — it was judged
  not worth the complexity for a personal app, but flag if that's too coarse in practice once a
  few doc-research curricula have been tried.
- File-path corrections made during self-review, not by the mechanical consistency gate: the
  first draft of this plan assumed `updateModule`/`updateTopic` lived in `curriculum.repo.ts`
  (mirroring how `updateCurriculum` does) — verified directly against the codebase that modules
  and topics actually have their own dedicated `apps/api/src/module/module.repo.ts` and
  `apps/api/src/topic/topic.repo.ts` files, and that route dispatch happens in `server.ts`
  (switch-on-`RouteName`), not inside each entity's `.controller.ts`. Fixed before this spec was
  confirmed — noted here since it's exactly the kind of thing a lighter implementation model
  would otherwise silently get wrong by trusting the first draft's assumed pattern.

## Manual steps
No manual steps required — no new env vars, no new secrets, no infra outside the generated
migration (applied via the existing `npm run db:migrate` step already used in this repo).

## Post-deploy checks
- After deploying, run `/study <a technology known for step-by-step docs>` (e.g. a tutorial-heavy
  framework) and confirm `doc-research-architect.agent.ts` actually sets `strictOrder: true` in
  practice, not just structurally accepting the field — this is the one behavior typecheck can't
  verify (LLM output content, not shape).
- Confirm the strict-order inline note actually renders when a curriculum has `strict_order: true`
  and a topic is promoted/demoted with no visible reorder — the one UX detail most likely to read
  as a bug if the copy is missing or unclear.
