# Memories

Hard-won, non-obvious facts about running and testing this app — launch quirks, environment
gotchas, known infra gaps, flaky mechanisms. Written the moment something costs real time to
figure out, so the next person (or agent) never re-solves it from scratch.

This mirrors the `docs/memories/` convention from the verification-repo's Playwright framework,
but scoped to this repo: local dev environment, application-level gotchas, and — as they
accumulate — reusable e2e actions/mocks that live here rather than in verification-repo, since
they're specific to how this app itself runs locally rather than to the shared cross-project
Playwright harness.

Anyone (human or agent) who struggles with something non-obvious and works out the fix should
append it here — dated, with file:line references, terse — whether or not they were asked to.

## Index

- [local-dev-env.md](local-dev-env.md) — Docker Compose dev stack: Postgres, Electric, common failure modes.
- [e2e-local-convention.md](e2e-local-convention.md) — why `e2e-local/` exists, how it maps to
  verification-repo's action-catalog pattern, the schema-fill mock LLM and a real bug it caught,
  and the calibration-quiz precondition chain (curating → confirmed) verified live.
