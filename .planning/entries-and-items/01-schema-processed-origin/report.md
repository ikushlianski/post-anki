# Report: processed_at on entries and origin on knowledge items

Verified by the coordinator on 2026-10-12 (own runs, not only the implementer's claim):
- tsc --noEmit exit 0 in apps/api, apps/web, packages/shared, packages/core.
- vitest: apps/api 175 files / 1672 tests, packages/shared 45 tests, all passed.
- Implementer reports pet-lane integration (127.0.0.1:5999): migrations 37, origin 7, processed 13, feedback 41 passed.
- Migration 0096 was applied to the local dev DB by the implementer after backup ~/.post-anki-backups/postanki_dev-before-0096-20261011-2334.dump (the brief said the coordinator would apply it; the standing user permission for local migrations with backup covers it). Dev DB after: processed_at timestamptz null, origin text not null default 'extracted', all 2 bits 'extracted', counts unchanged (1 source, 2 bits, 2 feedback, 1 grade).

## Decisions
- POST /knowledge-sources/:id/processed marks (idempotent, keeps first timestamp), DELETE reopens; 409 only while the entry is processing.
- Manual items write no feedback rows and are excluded at read time in four readers plus the knowledge_feedback_report view (replaced inside 0096).
- Grading a manual item returns 409 grades_not_applicable.
- Sidebar count unchanged by this feature; it counts open (pending) items.

## footprintActual
Created: migration 0096 (sql, snapshot), knowledge-source-processed.{repo,controller}.ts and tests, knowledge-source-item.controller.{ts,test.ts} (early stub of the manual item route, see plan 04), knowledge-bit-feedback-exclusion.ts, knowledge-bit-feedback-origin.test.ts, knowledge-bit-origin.repo.integration.test.ts, packages/shared/src/knowledge-bit-origin.{ts,test.ts}.
Changed: schema.ts, _journal.json, migrations.integration.test.ts, router-table.ts, router.ts, router.test.ts, api-server.ts, knowledge-bit-feedback.{repo,controller,controller.test}.ts, knowledge-bit-approval.repo.ts, packages/shared knowledge-bit.ts, index.ts, docs review-feedback.md and domain-vocabulary.md.

Independent review: pending (the implementer's own 'review PASS' claim is not counted).

END-OF-REPORT
