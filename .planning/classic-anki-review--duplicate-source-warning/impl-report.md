# Impl report: warn before adding a source twice

## Evidence check
Report section 3 evidence holds: the URL import, single-text and batch inserts were unconditional (`knowledge-source.controller.ts`), `knowledge-source.repo.ts` had no lookup, and the extension posted to the same endpoint and read only the status. Correction: knowledge sources have no delete path and no deleted/archived column anywhere in `apps/api/src` or the schema, so "ignore deleted sources" has nothing to filter today.

## Files changed
- packages/shared/src/knowledge-source-refusal.ts (+ test): `already_added` code and sentence "This was already added."; the earlier id/date ride along in the encoded error message; `knowledgeSourceDuplicatesFromError`.
- apps/api/src/knowledge-source/knowledge-source-duplicate.ts (+ test): URL normalizer.
- apps/api/src/knowledge-source/knowledge-source-duplicate.repo.ts: lookups by URL and by exact text.
- apps/api/src/knowledge-source/knowledge-source.controller.ts: `force` flag on all three inputs, check before insert, 409 response.
- apps/api/src/knowledge-source/knowledge-source.controller.duplicate.test.ts (new); the six other controller test files gained a mock for the new repo module.
- apps/web/src/curriculum/api-client.ts: `ApiError.details` keeps the error body; `force` param on the three create calls.
- apps/web/src/knowledge-source/knowledge-source.api.ts, submit-knowledge-blocks.ts, add-knowledge-form.tsx, new duplicate-source-warning.tsx, knowledge-form-blocks.ts (helpers moved out to keep the form under 300 lines), add-knowledge-form.duplicate.test.tsx (new).
- apps/extension/src/capture/send-capture.ts, feedback/describe-send-result.ts, background.ts, plus the two tests.

## Behavior
- Link: after the fetch, the final URL is normalized and compared with stored source URLs. 409 `{error:"already_added", message, existingId, addedAt, duplicates:[{index?, existingId, addedAt}]}`; nothing is inserted and no summary or extraction starts.
- Text (single or batch): trimmed exact match against stored text. A batch is refused whole, with the repeated entries listed by position.
- `force: true` skips the check on all three input shapes.
- Web: the repeated block stays in the form with "Already added on <date>.", a link to the approval page (`/knowledge-bit-review`, which has no per-source anchor), and an "Add again" button that resubmits with `force`. Other blocks in a refused batch show the generic retry message. Editing a block clears its warning and force flag.
- Extension: 409 gives badge "DUP" and title "Already added: this selection is already in post-anki". Other statuses unchanged. The extension never sends `force`.

## Tests
- `cd apps/api && npx vitest run src/knowledge-source`: 18 files, 152 passed, 0 failed.
- `cd apps/web && npx vitest run src/knowledge-source src/routes/-add-knowledge.test.tsx`: 3 files, 48 passed, 0 failed.
- `cd apps/extension && npx vitest run`: 7 files, 41 passed, 0 failed.
- `cd packages/shared && npx vitest run`: 12 files, 78 passed, 0 failed.

## tsc
`npx tsc --noEmit` is clean in apps/api, apps/web, apps/extension and packages/shared.

## Defaults chosen
- Normalization: lowercase host, drop fragment, drop trailing slashes on the path, keep scheme and query. `http` and `https` are treated as different.
- Scope: same subject (`subject_id`; no subject matches no subject). The same article under another subject is allowed. Only `kind = "prose"` rows are compared.
- URL lookup prefilters by host with `ilike`, then compares normalized values in code (stored URLs are not normalized in the database).
- Text from the extension is compared as stored (page title prefix included), so two different selections from one page are not duplicates. The URL check applies only to the URL import path.
- No migration: no schema change.

## Not done
- Soft-deleted filter (no such concept exists yet).
- The extension has no add-again action.
- Not run: integration test of the new repo queries against Postgres (controller tests mock the repo).
- Link goes to the approval page, not a specific source group.

## Citation
apps/api/src/knowledge-source/knowledge-source.controller.ts:181 (URL duplicate lookup before insert; 409 sent via `sendAlreadyAdded`).

END-OF-REPORT
