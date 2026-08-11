# Build log: Separate progress overlay from structure

Implementation note: the shared local `post-anki-dev-db` (port 5437) turned out to have drifted
schema (missing `subjects.embedding` columns from migration 0027) from other worktrees/branches
having migrated it with a different history — unrelated to this ticket. Rather than touch that
shared container, the runtime proof ran against a disposable throwaway Postgres container, migrated
cleanly from this branch's own migrations, seeded with a demo subject/domain tree, and torn down
after the screenshot was captured. `apps/api/.env.local` was used to point the dev API at it
temporarily and was restored to its original content afterward.
