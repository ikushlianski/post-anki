# Item 1 (durable cards) implementation report

All paths under /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api. Nothing staged or committed.

## Files
New (src/cards): cards-claim.ts, cards-compile.orchestrator.ts, cards-fanout.orchestrator.ts, cards-inngest.events.ts, cards-inngest.limits.ts, cards-inngest.workflow.ts, cards.starter.ts, plus tests cards-inngest.workflow.test.ts, cards-inngest.config.test.ts, cards.starter.test.ts.
New: src/shared/durable-flags.ts.
Edited: src/cards/cards.orchestrator.ts (now claim + dispatch only; re-exports compileCards, buildCardsPrompt and the in-process fan-out so existing imports work), src/cards/cards.repo.ts (touchGeneratingCards, failStaleGeneratingCards), src/curriculum/curriculum-structure.ts, src/learning-list/slice-release.ts, src/api-server.ts, src/shared/env.ts, .env.example, tests curriculum-structure.test.ts, slice-release.integration.test.ts, cards-fanout.integration.test.ts, cards-generation-concurrency.integration.test.ts.

## Behaviour
- DURABLE_CARDS (default off) read by isDurableCardsEnabled via parseDurableFlag. Off: the old in-process code runs unchanged (same fan-out, same detached compile).
- On: the claim still happens first (under the subject lock) in every path. The starter then sends events (id cards-<topicId>-<claimMs>), one batch for course fan-outs. If the send throws, the claimed topics are compiled in-process (cap 3) so none is stranded.
- cards-compile function: steps begin (re-asserts generating and refreshes updatedAt, else skipped), compile (one model call plus write; returns only a card count), embed (errors swallowed and logged). retries 1, concurrency [3, per-topic 1], throttle 30/1m burst 3, singleton skip per topic, timeouts start 14m / finish 10m. onFailure sets the card set to failed, guarded by try/catch.
- cards-compile-timeout handler triggers on inngest/function.cancelled for cards-compile and calls failStaleGeneratingCards, which sleeps 2m and then fails generating sets older than the 15m stale threshold.
- compileCardsOrThrow added; compileCards is try/catch around it and writes failed.
- Four callers switched: confirmStructure and slice-release use startCardsForTopics; maybeStartCardsInBackground uses startCardsBackground; startCardsManually uses startCardsManuallyDurable.
- Both functions registered in api-server.ts.
- DURABLE_CARDS documented in .env.example. It is added to the env schema and counts toward the signing-key-required rule.

## Tests
- `npx vitest run src/cards src/curriculum src/learning-list src/knowledge-bit/pipeline-kick`: 21 files, 258 tests passed, 0 failed.
- Cards integration (pet-projects DB, port 5999): 8 files, 50 tests passed, 0 failed. 6 of those are new durable-mode and cutoff tests.
- Extra: `npx vitest run src/shared src/learning-list`: 18 files, 161 passed.
- New unit tests: workflow 9, config 5, starter 9.
- `npx tsc --noEmit` in apps/api: zero errors.

## Deviations from the plan
1. compileCardsOrThrow is split further: generateAndStoreCards (model call plus write, returns the count) is what the "compile" step calls. compileCardsOrThrow = that plus the swallowed embed.
2. Compile, claim and fan-out code moved out of cards.orchestrator.ts into cards-compile.orchestrator.ts, cards-claim.ts and cards-fanout.orchestrator.ts. The orchestrator imports the starter, and the starter needs those, so this avoids an import cycle.
3. startCardsManuallyDurable is an alias of startCardsBackground, because both dispatch an already-claimed topic identically.
4. The timeout handler sleeps 2m, then sweeps with GENERATING_STALE_THRESHOLD_MS (15m) as the cutoff, and the start timeout is 14m (see Fix round).
5. The claim time in the event id is Date.now() at send, since the claim function does not return updatedAt.
6. DURABLE_EXTRACTION has no entry in .env.example (only in README and the signing-key comment), so DURABLE_CARDS sits directly above that signing-key comment block.
7. The signing-key error message in env.ts now names DURABLE_CARDS as well.

## Defaults
Flag off; retries 1; concurrency 3; throttle 30/1m burst 3; start 14m, finish 10m; sweep delay 2m, sweep cutoff 15m; in-process fallback concurrency 3.

## Undone
- No live run against a real Inngest server (only @inngest/test and a real-Postgres starter path with the Inngest client mocked).
- The existing README Inngest section was not edited.
- Item 2 not started.

## Citation
The durable job with its begin/compile/embed steps, singleton skip and per-topic concurrency is at apps/api/src/cards/cards-inngest.workflow.ts:20-30. The starter's flagged fan-out is at apps/api/src/cards/cards.starter.ts:68. Registration is at apps/api/src/api-server.ts:359-360.

## Fix round
- Start timeout 30m changed to 14m (finish stays 10m), so a queued or running job cannot outlive the 15m reclaim window and no live or queued row has an updatedAt older than 14m.
- cards-compile-timeout now runs step.sleep("2m") first, then failStaleGeneratingCards(GENERATING_STALE_THRESHOLD_MS). It only fails rows no queued or running job can still own. The 9-minute number is gone (apps/api/src/cards/cards-inngest.workflow.ts, apps/api/src/cards/cards-inngest.limits.ts).
- Config test now asserts start < stale threshold, finish < stale threshold, and sweep cutoff equals the stale threshold. Workflow test asserts the handler sleeps before sweeping and uses that cutoff.
- Reruns: unit command 21 files, 259 tests passed; cards integration 8 files, 50 tests passed; `npx tsc --noEmit` zero errors.
- Not fixed (Medium): a manual regenerate dropped by singleton skip while the previous run is still embedding leaves the set generating until the 15m stale rule. A clean fix needs a way to re-send after the old run ends, which is not cheap. It self-heals via the stale rule.

END-OF-REPORT
