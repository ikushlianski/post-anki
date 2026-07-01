# @e2e subject-add — create a subject

**Narrative.** From the Curricula home, the owner types a subject name and clicks
Add subject. The new subject appears as a card in the list, and a row is written
to the `subjects` table.

**Actions:** `createSubject` (`features/subject/actions`).

**Fixtures:** `uniqueSubjectName` (`features/subject/fixtures/mock-data`) — a fresh
synthetic name per run so repeated runs don't collide.

**Pre-test state:** baseline-only. The local e2e Postgres is migrated to the
current schema; no seed rows are required (the subject is created from scratch).

**Assertions (two layers):**
1. UI — the `subject-name` card with the created name is visible.
2. Persistence — `rowExists('subjects', { name })` against the local e2e DB.

**Reseed strategy:** none between runs; isolation comes from a unique name per
run. The DB is local + ephemeral (tmpfs) and is recreated when the container is
removed.

**Proof:** `e2e/proof/subject/add-subject.png`, framed on `subject-card`.
