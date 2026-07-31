ontology-audit-trail — Add a merge/split audit trail (issue #62)
─────────────────────────────────────────────────────────────
S1  Merging two subjects via the UI writes a visible, correctly-populated log row   PASS
S2  mergeTags writes a correct audit log row (backend integration)                  PASS
S3  mergeCurricula writes a correct audit log row + negative case (backend)         PASS
S4  mergeDomainNodes writes a correct audit log row (backend integration)           PASS
S5  The admin view renders all four entity types correctly                         PASS
(extra) transactional-rollback proof (mergeTags, mergeDomainNodes)                  PASS

5/5 scenarios pass (2 e2e + 3 backend-integration), plus the extra rollback proof. All backend
unit/integration suites green (271 tests), all workspace typechecks clean.

Regression sweep (full Playwright corpus, fresh e2e DB, headless): 70/84 passed, 14 failed.
All 14 failures are pre-existing and unrelated to ontology-audit-trail:
- 4 curriculum tests (incl. curriculum-merge.S1/S2) — known, already-queued hydration race in the
  shared `study-technology-toggle` flow (see .planning/wishlist.md, logged 2026-07-31 during the
  prior domain-node-merge review, confirmed here again via error-context.md).
- 6 resource-enrichment + 4 tree-growth tests — target UI code lives only on the unmerged
  `chrome-extension-note-capture` branch, not on `main`; not part of this review's scope.

No bugs found in ontology-audit-trail itself.
