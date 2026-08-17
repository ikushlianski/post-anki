---
type: todo
branch: decouple-curricula-from-domain-nodes
task: "Seed the initial static taxonomy into the database (#82 follow-up)"
state: open
updated: 2026-08-04
---
# Todo: Seed the initial static taxonomy into the database

## Decisions to make

Nothing to decide in this ticket. One related decision stays open elsewhere: GitHub issue #84
Decision #2 (which subject receives the real taxonomy) — already queued there, not this ticket's
job to resolve or act on.

## To review / clarify

Nothing to review.

## Coding tasks

- [x] parseTaxonomyYaml deriver + unit tests under src/domain-map/ (SCENARIO 1, 4) — 6/6 green,
      including the real 208-node/15-root/3-level shape and duplicate-sibling-name rejection
- [x] Copy taxonomy.yaml content from main checkout into apps/api/scripts/seed-data/it-taxonomy.yaml
      — md5-verified byte-identical to the main checkout's copy
- [x] Rewrite seed-domain-taxonomy.ts to read YAML via parseTaxonomyYaml
- [x] Add yaml dependency + db:seed:domain-taxonomy npm scripts (root + apps/api)
- [x] seed-domain-taxonomy.integration.test.ts against throwaway database (SCENARIO 1,2,3,5,6,7) —
      6/6 green against a real freshly-migrated throwaway Postgres, no leftover throwaway DBs
- [x] Create local-dev-only subject and run real seed, leave rows in place (DoD)

## Manual steps

- [x] Run `npm install` in this worktree after adding the `yaml` dependency — worktrees don't
      share `node_modules` with the main checkout
- [x] Create the `"IT Taxonomy (local dev seed)"` subject in postanki_dev via direct SQL INSERT
      only (never seed-subjects.ts) and run the seed script against it for real — this IS the
      ticket's deliverable, not deferred work. Production placement stays deferred to #84 Decision #2.
      Subject id: sub_8b10fa06-cd91-4f72-b338-ef8b9785ba1e. Confirmed 208 rows / 15 roots / all
      static_taxonomy / 0 mappings persist in postanki_dev; Webdev (16 rows) and Gap Badge Demo
      Subject (1 row) verified unchanged; re-ran the seed a second time against the same real
      database and confirmed created: 0, skipped: 208 (idempotent on the persistent DB too).

## Post-deploy checks

No post-deploy checks needed — nothing in this ticket ships to production data.

## Resolved

- parseTaxonomyYaml unit tests (6/6), seed-domain-taxonomy.integration.test.ts (6/6 against a real
  throwaway Postgres), and the persistent postanki_dev seed run all green. Typecheck clean. No lint
  script exists in this repo (checked both root and apps/api package.json scripts).
