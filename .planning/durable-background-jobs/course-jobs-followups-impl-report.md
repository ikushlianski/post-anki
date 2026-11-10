# Course jobs follow-ups

## Item 1 - a late failure never fails a newer run

Each durable claim now generates a run token, stores it in a new nullable text column `curricula.research_owner` (migration 0103_flawless_rocket_raccoon.sql, generated and applied with the project scripts), and puts it in the event data (`ownerToken`, optional). The research, draft and parse paths pass it to every touch, finish, clear and fail call. Those calls match on course id plus token, so an old run's late onFailure, finalize or clear changes nothing once a newer run has claimed the course. The age-based sweep is unchanged. Events without a token (sent before this change) fall back to matching on course id only. Finishing research also clears the owner.

Citations: apps/api/src/curriculum/curriculum-job-owner.ts:5 (guard), apps/api/src/curriculum/curriculum-research-jobs.repo.ts:8-45, apps/api/src/curriculum/curriculum-draft-jobs.repo.ts:25-50, apps/api/src/db/schema.ts:110, starters create the token in defaultDeps (curriculum-jobs.starter.ts, curriculum-draft.starter.ts, curriculum-parse.starter.ts).

Integration tests (real Postgres): curriculum-parse-jobs.integration.test.ts has 3 new (old run's fail, clear and finish leave a newer run's status and touch untouched; matching run still fails the course; touch records the claiming run). curriculum-draft-jobs.integration.test.ts has 2 new (same for the draft, including its pending turn).

Deviation: the exact claim timestamp could not serve as the token because the prepare step touches the course again, so a separate column was used.

## Item 2 - domain-recommendation research on the durable engine

The researchCurriculum call at apps/api/src/domain-recommendation/domain-recommendation.orchestrator.ts:134 now uses startResearch. With the flag off the starter runs researchCurriculum in-process, so behaviour is identical. The test's module mock now targets the starter module.

## Results

Unit `npx vitest run src/curriculum src/cards src/shared src/domain-recommendation`: all passing after updating existing workflow tests for the extra token argument. Curriculum integration: 15 files, 89 tests passing. tsc: zero errors in apps/api and apps/web.

Not done: no unit test that sends a token through the workflow's onFailure (covered by the integration tests at repo level); lint not run.

## Fix round

- The orchestrator finished this round after the implementer hit its request cap. The implementer's last edit had not applied.
- The starter claim for research, draft and parse now only refreshes the touch and never writes the owner. Release clears the touch by course id. Ownership is taken in the run's own first step: begin for draft, prepare for research and parse.
- A new integration test covers the dropped-claim case. Run A begins and owns the course, a retry claim only touches it, A finishes and clears the touch, and the course stays healthy with the touch null.
- Runs: unit 37 files, 375 tests passed. Curriculum integration 15 files, 90 tests passed twice in a row. One earlier full run failed across unrelated files and passed on rerun, the same flake the reviewer saw. tsc is clean in apps/api.
- Citation: apps/api/src/curriculum/curriculum-draft.starter.ts:31.

END-OF-REPORT
