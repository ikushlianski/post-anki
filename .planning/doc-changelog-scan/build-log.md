# Build log: doc changelog scan

## Before seeding a second gated subject — read this first

**FIXED 2026-08-01 — this whole section is now history.** `tracked_tool_scan_state` is
composite-keyed on `(subject_id, tool_key)` as of migration `0030_groovy_madame_web`;
`getTrackedToolScanState()` / `upsertTrackedToolScanState()` both take a `subjectId`, and
`apps/api/src/domain-map/doc-scan-subject-watermark.integration.test.ts` proves two gated
subjects each get their own agent call, their own suggestions and their own four watermark
rows in one scheduled run. The paragraphs below describe the pre-fix behaviour and are kept
only for the reasoning. Note that the local e2e DB's four pre-existing watermark rows were
dropped by the migration's backfill rule (it only attributes rows when exactly one gated
subject exists), which costs one redundant scan and nothing else.

`tracked_tool_scan_state` is keyed by `tool_key` ALONE, with no subject
dimension — a genuine architectural limitation discovered while implementing
this feature, not a hypothetical. `runDocScanForAllTrackedSubjects()` (the
scheduled job's actual entry point) dispatches once per subject returned by
`listSubjectIdsWithDomainNodes()`; the FIRST subject processed in any given
run genuinely sees each tool's real change and calls the agent, advancing the
GLOBAL watermark — every subject processed AFTER that in the same run then
sees the identical content as already "unchanged" and gets zero suggestions,
even though it has never itself been scanned. Proven deterministically by
`apps/api/src/domain-map/doc-scan.orchestrator.test.ts`'s
`handleTriggerAllDocScans` test (asserts exactly one of N gated subjects gets
`agentCalled: true` per dispatch, not all of them).

At today's scale (exactly one gated subject, "Programming / Web
Development") this is invisible — there is nothing to collide with. The
moment a SECOND subject is gated (gets its own `domain_nodes` tree), only one
of the two subjects will ever receive real doc-scan suggestions per
scheduled run; the other will silently see nothing, indefinitely, unless its
own tracked content happens to change again on some later run before the
other subject's scan claims the watermark first.

**Fix, when needed:** make `tracked_tool_scan_state` composite-keyed on
`(subject_id, tool_key)` instead of `tool_key` alone — a real schema change
(new migration, repo function signature change, orchestrator per-subject
watermark lookup) that a human should decide on and scope explicitly, not
something to patch quietly inside this ticket's scope. `spec.md`'s own
framing of this as "deferred optimization, not correctness-relevant" is
incorrect once a second subject exists — it becomes a correctness bug, not a
performance one.
