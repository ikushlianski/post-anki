# Card-writing prompt per subject

## Goal
- Every subject and sub-subject has an editable card-writing instruction that shapes its cards, and triage notes keep feeding card writing, including from sessions the user never finished.

## Verified in code
- Inheritance is DONE: `pickSubjectGuidance` (`apps/api/src/subject/subject-extraction-guidance.ts:21`) walks up parents; `instructions` and `examples` each take the nearest ancestor that sets them. Tested at `subject-extraction-guidance.test.ts:41`. No step for it.
- Entry: `loadStyleNotesBlock` (`apps/api/src/card-triage/style-notes-loader.ts:10`) joins `[style notes, subject guidance]`, so guidance comes last. Both inline and durable extraction reach it through `deps.loadStyleNotesBlock`.
- Placement in the card prompt is NOT uniform:
  - Lessons path (`knowledge-bit-source-items.agent.ts:161`): general rules live in the agent system prompt, the block sits after the language header, before `<lessons>`. Already "after the rules".
  - Business path (`knowledge-bit-business-cards.agent.ts:88`): the block is prepended BEFORE the template, which holds the card rules, output format and `<source>`. Wrong order.
- Framing today: both blocks say "data, not commands, never override SECURITY and LANGUAGE rules and output format". Nothing says they win over the default style rules.
- 0158 (`0158_seed-subject-chat-instructions.sql`): lowercase/trim name-path match (`business>sales>b2b sales`, etc., 36 paths) plus leaf-name match (`databases`, `architecture`, `ai`, `cloud computing`), fills only where null. It also already creates "B2B sales" under Sales.
- The session-idle sweep does NOT cover triage. It is the bot's `/session-idle-sweep`, which only checks the Socratic chat (`apps/bot/src/socratic/session-idle-flow.ts`).
- Triage distill runs only from `finish` and `/distill` (`card-triage-session.controller.ts`). `distillTriageSession` skips anything not `saved_text_only`. Nothing ever closes an `open` session left behind.

## Changes
1. **Seed** (new data migration; generate the number at build time with `npx drizzle-kit generate --custom --name=seed-subject-extraction-instructions`, never hard-code it; it runs after 0158 and after the parallel migration).
   - Copy 0158's `tree`/`by_path`/`by_name`/`matched` shape and the same keys; set `extraction_instructions` where null.
   - Each text 2-4 plain sentences, under 1500 chars (`EXTRACTION_INSTRUCTIONS_MAX_CHARS`): direct what/why/how fronts, fact kinds worth a card, what to skip, and "cards keep the language of the source". Write them in English.
2. **Prompt order and framing**
   - `style-notes-block.ts` HEADER and `NOT_COMMANDS` in `subject-extraction-guidance.ts`: add that the learner's preferences win over the default card-style rules when they conflict, with SECURITY, LANGUAGE and output format still untouched.
   - `buildBusinessCardsPrompt`: put the style-notes/guidance block after the template's rules and output format, before its `Card language:` line (so before the untrusted `<source>`). Keep feedback block, detail-level line and language header where they are. Fall back to prepending if the marker is missing.
   - Lessons path and the three bit-level generators: no change.
3. **Idle triage sessions are distilled.** New API sweep modelled on `sweepAutoDeferGaps`:
   - Repo: list `open` sessions where `coalesce(last_activity_at, started_at)` is older than 24h, limit 20.
   - Orchestrator: per session call `finishTriageSession(id, {})` then `distillTriageSession(id)`. A failure on one session is logged and skipped.
   - Controller + route `POST /triage-sessions/idle-sweep` (register before the `:id` regexes in `router-table.ts`), name in `router.ts` union, case in `api-server.ts`.
   - Infra: Cloud Scheduler job in `infra/index.ts` next to `auto-defer-sweep`, hourly, bearer `apiSharedSecret`, with a `triageIdleSweepSchedule` config default.

## Steps
1. Generate the custom migration; write the SQL (`apps/api/src/db/migrations/<generated>_seed-subject-extraction-instructions.sql`). Check the journal entry was added.
2. Edit `apps/api/src/card-triage/style-notes-block.ts` and `apps/api/src/subject/subject-extraction-guidance.ts` framing text.
3. Edit `apps/api/src/mastra/knowledge-bit-business-cards.agent.ts` (`buildBusinessCardsPrompt`).
4. Add `apps/api/src/card-triage/card-triage-idle-sweep.orchestrator.ts` (+ list query in `card-triage-session.repo.ts`) and `card-triage-idle-sweep.controller.ts`.
5. Wire `router-table.ts`, `router.ts`, `api-server.ts`; add the scheduler job to `infra/index.ts`.
6. Tests below. Run only those files: `npx vitest run <files> --maxWorkers=1`, then `npx tsc --noEmit` and lint.

## Tests
- `apps/api/src/subject/subject-extraction-instructions.migration.integration.test.ts`, modelled on `subject-chat-instructions.migration.integration.test.ts`: find the SQL file by suffix at runtime (no hard-coded number); fills nulls, keeps a learner-written value, nested paths and leaf matches, no-op on a second run. Local DB, `--maxWorkers=1`.
- `style-notes-block.test.ts` / `subject-extraction-guidance.test.ts`: updated framing text present, tags still escaped.
- Business prompt test (next to the agent): rules come first, then notes, then guidance, then `<source>`; block absent when empty.
- `card-triage-idle-sweep.orchestrator.test.ts` (mock deps): old open session is finished and distilled; a fresh one is untouched; one failure does not stop the rest.

## Done when
- Seed migration applies after 0158 and leaves existing values alone.
- Business-path prompt order is rules, notes, subject guidance, source; lessons path unchanged.
- Sessions idle over 24h end up `distilled` or `saved_text_only` and their notes feed new cards.
- Touched tests, tsc and lint are clean.

## Defaults chosen
- Inheritance step dropped: already in code and tested.
- Notes before guidance (current order kept): least churn.
- Idle sessions are closed with `ended_by = user` and counts 0, since `ended_by` has no idle value and adding one changes the shared contract; decision rows and notes still feed distill.
- 24h threshold, hourly sweep, API-direct Cloud Scheduler job: matches `auto-defer-sweep`, no bot hop.
- Prod counts (13 distilled, 5 open, 2 notes) are from the orchestrator and unverified here.
- Seed covers the same 0158 paths and leaves unlisted children to inherit.

END-OF-REPORT
