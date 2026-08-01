---
type: todo
branch: doc-changelog-scan
task: doc-changelog-scan
updated: 2026-07-28
---

# Manual deploy steps — doc-changelog-scan (issue #49)

These steps CANNOT be run by an agent in this session (standing safety rule:
no unattended `pulumi up` / real deploy action). A human must run them once,
in order, before this feature's scheduled scan can actually fire in prod.

## 1. Set the new Pulumi secret

`infra/index.ts` reads a new secret, `apiSharedSecret`, that has never existed
in Pulumi config before now (the API's `API_SHARED_SECRET` env var is
currently set only by CI via the `PROD_API_SHARED_SECRET` GitHub secret —
Pulumi had no visibility into that value until this change).

```bash
cd infra
PULUMI_BACKEND_URL=gs://post-anki-pulumi-state pulumi config set --secret apiSharedSecret <same value as the PROD_API_SHARED_SECRET GitHub secret> --stack prod
```

You will need `PROD_PULUMI_CONFIG_PASSPHRASE` (the same one CI uses) as
`PULUMI_CONFIG_PASSPHRASE` in your shell for this to succeed — it's a GitHub
Actions secret, not available to this session.

## 2. Deploy — run `pulumi up`

```bash
cd infra
PULUMI_BACKEND_URL=gs://post-anki-pulumi-state PULUMI_CONFIG_PASSPHRASE=<prod passphrase> pulumi up --stack prod
```

This is the actual deploy step this session was explicitly forbidden from
running. Expect the diff to show exactly one new resource
(`gcp.cloudscheduler.Job` named `post-anki-doc-scan`) plus its associated
outputs — no changes to any other Cloud Run service, domain mapping, or
service account (confirmed by the `pulumi preview` captured during this
session — see the session report for the exact preview output and whether it
could be produced at all in this session).

Alternatively, this can run through the existing CI pipeline
(`.github/workflows/deploy.yml`'s `infra` job) on the next merge to `main`,
since that job already has `PROD_PULUMI_CONFIG_PASSPHRASE` wired in as a
GitHub secret — once step 1 above is done, a normal merge deploys the
scheduler job automatically without a manual `pulumi up`.

## 3. Verify it worked

- **GCP Console**: Cloud Scheduler page (project `post-anki`, region
  `europe-west1`) should show a job named `post-anki-doc-scan`, schedule
  `0 9 * * 1` (Monday 09:00 Europe/Warsaw), target
  `POST https://api.postanki.ilya.online/doc-scans`.
- **CLI**: `pulumi stack output docScanJobName --stack prod` (with the same
  `PULUMI_BACKEND_URL`/passphrase as above) should print `post-anki-doc-scan`.
- **Manual trigger check**: In the GCP Console's Cloud Scheduler page, click
  "Force run" on `post-anki-doc-scan` and confirm it returns `200` (not
  `401` — a `401` there means step 1 was skipped or used the wrong secret
  value) and that a fresh row appears in `tracked_tool_scan_state` for each
  of the 4 tracked tools shortly after (or that the run completes with no
  new watermark rows if nothing has genuinely changed since the last real
  scan — both are valid outcomes; a `401`/`5xx` is not).

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
