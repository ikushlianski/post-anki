---
type: todo
branch: gap-triage
task: "[Story] User triages a gap as important, deferred, or dismissed (#29)"
state: open
updated: 2026-08-14
---

# Todo: Gap triage — Important / User-Deferred / Dismissed (#29)

## Decisions to make

Nothing blocking — every fork in this plan had a safe, reversible, pattern-following default
(see `plan.md` "Decisions made autonomously", 9 items, all logged one-line to
`ORCHESTRATOR-MEETING-NOTES.md`). Nothing here requires Ilya before implementation starts.

## To review / clarify (not blockers, flagged for awareness)

1. **Tracker/reality mismatch on #43.** GitHub shows #43 ("On-demand gap list for any registered
   tool" — the `/gaps` command) as CLOSED, with a `closed` timeline event carrying no linked
   commit. `grep -rn "'/gaps'\|GAPS_REPLY" apps/bot/src` returns nothing — the command does not
   exist in the codebase. This plan does not attempt to build `/gaps` (that would be scope theft
   from #43's own issue body), but the tracker status itself is misleading and worth a separate
   correction (reopen #43, or file a fresh issue) outside this story's scope.
2. **Reachability gap until #27 ships.** A brand-new gap has no Telegram-initiated trigger to its
   triage keyboard until #27 (session summary) lands — this plan's only trigger is the 60-day/
   6-month resurfacing job, which by construction only fires on already-triaged gaps. Documented
   in `plan.md` "Known limitation," not silently defaulted past. Manual/API-direct verification
   substitutes until #27 ships.
3. **"Important gaps appear within 5-7 days" is verified as selection-weight priority, not a
   literal timer** (SCENARIO 4 / AC15) — no code path in this repo can assert a wall-clock
   delivery deadline; the daily push either includes the top-priority gap or it doesn't run that
   day at all (an external Cloud Scheduler concern, already out of unit-test reach per the
   existing `no-guilt-no-followup` spec's own note on `handleDailyPush`'s cadence).

## Manual steps / sequencing constraints

1. **Migration ordering — do not generate the gaps-triage migration before the current
   uncommitted WIP lands.** `git status` shows untracked `apps/api/src/db/migrations/
   0032_robust_exodus.sql` and a modified `apps/api/src/db/migrations/meta/_journal.json`
   alongside committed `0033_rainy_bug.sql` — the journal is a serialized array of migration
   entries. Running `npm run db:generate -w @post-anki/api` for this story's schema change
   against the currently-uncommitted WIP state risks the new migration's journal entry
   conflicting with whatever entry the WIP's own commit introduces. Sequence: let the
   probe-session/cards WIP land (commit) first, then generate this story's migration in its own
   follow-up commit against the then-current journal — do not generate both in the same
   uncommitted working tree.
2. **No new secrets or env vars required.** The new `POST /gap-resurface` bot endpoint reuses the
   existing `TELEGRAM_WEBHOOK_SECRET` (same as `/push`); the new API routes reuse the existing
   `API_SHARED_SECRET` bearer auth pattern already applied to every other `apps/api` route.
3. **Post-merge, before considering #29 "live" in production:** confirm the new
   `gapResurfaceJob` Cloud Scheduler entry actually deployed (`gcloud scheduler jobs list` or the
   Pulumi stack output), the same way `.planning/telegram-quiz-socratic-selection/todo.md`
   flagged webhook activation as a manual production step for its own story.

## Follow-ups this story deliberately does not build

- `/gaps` bot command (#43's actual scope — closed-but-unbuilt, see above).
- Session-summary gap display (#27 — separate, open story; this plan's keyboard module is built
  to be reused by #27 once it lands, per the issue's own "owned by #29 across all contexts"
  instruction).
- Auto-defer (#33) — this plan's `triageState` enum reserves the `user_deferred` literal
  specifically so #33 can add `auto_deferred` without a migration touching this column again.
- Web-dashboard surfacing of triage state — not requested by #29's acceptance criteria.
