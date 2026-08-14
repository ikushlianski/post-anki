---
type: todo
branch: 33-untriaged-gaps-auto-defer
task: "[Story] Untriaged gaps auto-defer so they never pile up (#33)"
state: open
updated: 2026-08-14
---

# Todo: Untriaged gaps auto-defer (#33)

## Decisions to make

Nothing blocking. Every fork in this story had a safe, reversible, pattern-following default —
14 of them, logged one line each to `ORCHESTRATOR-MEETING-NOTES.md`, full reasoning in `spec.md`
§"Decisions made autonomously" and the two §"resolved" sections above it. None touches money,
auth, or an irreversible data decision. Nothing here needs Ilya before implementation starts.

## To review / clarify (not blockers, flagged for awareness)

1. **#43 is still closed-but-unbuilt, and #33 is the second story to hit it.**
   `.planning/2026-08-14-gap-triage/todo.md` item 1 already recorded this during #29's planning.
   Re-verified for this story: `apps/bot/src/conversation/reply.ts:38-46` recognises only
   `/start`, `/today`, `/push`, `/study`. Two of #33's acceptance bullets and its entire "Visual
   distinction in /gaps" sub-section are unwalkable until it exists. Reopen #43 (or file its real
   replacement) — outside this story's scope, but it is now blocking display work in two stories,
   not one.
2. **#29's GitHub issue is still OPEN even though it merged as `c69651f`.** Worth closing so the
   board stops showing shipped work as in-flight; the same class of tracker drift as item 1, but
   in the opposite direction.
3. **The "≈1/3 base weight" table row is delivered as "eligible one day in three."** Not a
   deviation to discover in review — `spec.md` Decision 2 explains why a probabilistic sampler
   would be building a different system than the one in `daily-push.ts`, and every AC is worded to
   match. If Ilya wants literal weighted sampling, that is a change to `selectDailyPush`'s
   architecture and belongs in its own story.
4. **Auto-deferred gaps remain fully eligible for probe/Socratic session generation.** Only the
   daily push is gated. This matches the boundary #29 drew for `isPushExcluded` and nothing in
   #33's acceptance criteria asks to move it — but it means "auto-deferred" reduces push frequency
   only, not overall exposure to the concept.

## Manual steps / sequencing constraints

1. **Re-verify the migration journal before generating.** `git status` currently shows
   `apps/api/src/db/migrations/0039_robust_exodus.sql` and `meta/0039_snapshot.json` as
   newly-added (staged, uncommitted) while `0040_fantastic_oracle.sql` is committed — the same
   journal-ordering hazard `.planning/2026-08-14-gap-triage/todo.md` item 1 flagged for #29.
   Sequence: let the current working tree land as a commit first, then run
   `npm run db:generate:api` against the then-current `_journal.json`. Do not generate while
   uncommitted migration files are outstanding.
2. **Generate, never hand-write.** `npm run db:generate:api` (root) — equivalently
   `npm run db:generate -w @post-anki/api`. Note the root script is `db:generate:api`, not
   `db:generate`. Confirm a new `0041_*.sql` + `meta/0041_snapshot.json` actually appear before
   proceeding, then apply with `npm run db:migrate:api`.
3. **Inspect the generated SQL before committing it.** Expect exactly two
   `ALTER TABLE "gaps" ADD COLUMN` statements. Grep it for `triage_state` — zero hits is the
   proof that #29's plain-`text` column choice paid off (scenarios.md AC 2).
4. **No new secrets, no new Pulumi config step.** The sweep endpoint reuses `API_SHARED_SECRET`
   via the existing `authorized()` check, and `infra/index.ts:30` already declares
   `apiSharedSecret` as `config.requireSecret` (#49 paid that one-time cost). The two new config
   keys (`autoDeferSweepSchedule`, `autoDeferSweepTimeZone`) both have defaults, so an unset stack
   still deploys correctly.
5. **Post-merge, before considering #33 live in production:** confirm the new
   `post-anki-auto-defer-sweep` Cloud Scheduler job actually deployed
   (`gcloud scheduler jobs list` or the `autoDeferSweepJobName` stack output), the same manual
   production check `.planning/2026-08-14-gap-triage/todo.md` item 3 required for
   `gapResurfaceJob`. A silently-undeployed job here has no visible symptom — the read-time
   predicate keeps push behaviour correct, so only the stored column would drift.
6. **Post-deploy sanity check (scenarios.md SCENARIO 10):** after the first sweep runs, confirm it
   reported `autoDeferred: 0`. A non-zero first run means `untriaged_since` did not backfill with
   the migration timestamp and some portion of the historical backlog just auto-deferred at once.
7. **Integration tests need docker.** `npm run e2e:db:up` (port 5436) before
   `npm run test:integration -w @post-anki/api`.

## Quality gates (all must pass)

- `npm run typecheck` (root)
- `npm run test` (root)
- `npm run test:integration -w @post-anki/api`
- `npm run depcruise` — specifically guards the new `packages/core/src/curriculum` →
  `packages/core/src/gap-triage` import edge
- `npm run check-no-dynamic-imports`, `npm run check-web-node-builtins`

**There is no repo-wide ESLint.** The only `"lint"` script in the workspace is `apps/bot`'s, and
it is itself `tsc --noEmit`. The typecheck gate is the lint gate; do not go looking for an eslint
config that does not exist.

## Easiest things to get wrong (read before implementing)

1. **`markGapResurfaced`'s `deferral-expired` branch** (`gap-triage.repo.ts:120-127`) must set
   `untriaged_since = now`. Miss it and a 60-day deferral resurfaces and is auto-filed by the next
   morning's sweep — silent, and directly contradicts the resurfacing UX #29 shipped.
   scenarios.md AC 34 / SCENARIO 6.
2. **`applyRevisit`** (`gap-triage.ts:79-95`) must also set `untriagedSince: now` — same reason,
   different path. AC 33.
3. **`applyAutoDefer` must NOT stamp `triagedAt`.** It is not a triage. AC 16.
4. **Reactivation keys on *effective* state, not stored state** — otherwise the outcome of a Fail
   depends on whether the 06:00 job happened to have run. AC 21.
5. **A Fail on an already-untriaged gap resets nothing.** The issue's Tuesday/Wednesday/Thursday
   paragraph is explicit. AC 22.
6. **Do not hook reactivation inside `applyGapVerdicts`' `coveredById.has(...)` branch.** It is
   the obvious place and it is wrong: the freeform LLM path can omit the probed gap's verdict
   entirely, and `probe.service.ts:180-186` already treats a *missing* verdict as a fail. Hooking
   the explicit-`covered: false` branch would pass its unit test while never firing for a Telegram
   answer. Hook on the derived `probedFailed` in `probe.service.ts` instead — spec.md
   §"Fail reactivation", AC 24a.
7. **The sweep query needs `.orderBy(asc(gaps.untriagedSince))` before its `.limit()`.** Without
   it, a backlog larger than the cap can starve the actually-due rows forever. AC 37a.
8. **`insertDiscoveredGaps` needs a `now` parameter** — do not lean on the column default there,
   or the returned DTO and the DB row disagree by the DB-clock/app-clock gap. AC 8.

## Follow-ups this story deliberately does not build

- The `/gaps` bot command (#43's actual scope — closed-but-unbuilt; see "To review" item 1). The
  `(auto-filed)` / `(deferred by you)` formatter ships here, tested and unwired, for #43 to
  import in one line.
- Session-summary gap display (#27 — separate, open story).
- Any notification, badge, digest or count about auto-deferral. The issue says silent, twice.
- Weighted/probabilistic push sampling (see "To review" item 3).
- Excluding auto-deferred gaps from probe/Socratic session generation (see "To review" item 4).
- Web-dashboard surfacing of triage or auto-defer state — not requested by #33's acceptance
  criteria, same boundary #29 drew.
- Any change to `gaps.state`, `gap_mastery`, or `probe-session.service.ts`'s mastery cycle.
- **Reactivating an auto-deferred gap from a miss in the bot's MCQ quiz.**
  `probe-session.service.ts` never calls `applyGapVerdicts` and owns #57's advisory-lock-guarded
  transaction; adding a triage write inside it is a real scope expansion for evidence #33 does not
  name (its declared dependency is #23's one-tap pass/fail, which is fully covered). Worth a
  follow-up issue — spec.md Known limitations 7.
