# Plan: yulia-trus-import-workflow

Architecture: `.planning/business-anki-import-mcp/brief.md:23-24`. Paths from repo root.
Marks: [I] implementer, autonomous, repo-only. [U] prod action only the user runs.

## Goal
Yulia Trus' notes in `subjects/Business.txt` reach prod as pending knowledge sources under the right Business
sub-subject through a documented loop, the pipeline makes cards, and the file ends with headers only.

## Facts (verified)
- Local tools: `get_next_batch {size 1..50}` -> `{batchId, remaining, notes[{hash,deck|null,front,back,rawText,isCloze}]}`
  (`apps/anki-batch-mcp/src/anki-batch-tools.ts:5-22`); `confirm_batch {batchId}`; `status`. Hash = sha256 hex, 16
  chars, lowercase (`anki-export-parser.ts:48-49`), so `anki:<hash>` is 21 chars and fits `/^[a-z0-9:_-]{8,80}$/`
  (`apps/api/src/mcp/submit-knowledge.tool.ts:14`).
- Batch sessions live in memory (`batch-session.ts:16-18`); notes of an open batch are skipped by the next
  `get_next_batch` (`anki-batch-tools.ts:67-72`). Confirm keeps the header lines (`batch-file-store.ts:44-50`), so "empty"
  means `remaining: 0`, two header lines left.
- Image-occlusion notes get `rawText: ""` (`anki-export-parser.ts:55-60`); the review found 5, all deck
  `Маркетинг воронка` (`.planning/.runs/2026-11-07/business-anki-import-mcp/review-local-batch-server.md`).
- `submit_knowledge` needs `knowledge:write`, kicks detection itself after inserting (`submit-knowledge.tool.ts:66-68`),
  returns `alreadyPresent = notes - inserted` (`:74`); errors `missing_scope`, `unknown_deck`, `subject_missing`
  (`apps/api/src/mcp/register-write-tools.ts:34-47`). Accepted decks: `business-deck-mapping.ts:5-13`.
- Mapped sub-subjects Marketing, Sales, Loyalty, Hiring come from no migration, only the seed script
  (`apps/api/src/subject/seed/business-sub-subjects.seed.ts:9-17`, `apps/api/package.json:24`); Common/Finance exist via
  migrations 0104/0129. The deploy runs only migrations (`.github/workflows/deploy.yml:248-251`), so seeding prod is a [U] step.
- Prod: Cloud Run `post-anki-api`, public (`--allow-unauthenticated`, deploy.yml:305), base URL
  `https://post-anki-api-pl6jw2mdla-ew.a.run.app` (`apps/extension/src/settings/settings.ts:1`); `/mcp` sits on it
  (`.planning/mcp-content-access--mcp-server/plan.md:21`). DB is Neon; the string is the CI secret `PROD_DATABASE_URL`
  (`apps/api/README.md:95`, deploy.yml:251), so only the user can supply it.
- Token script `apps/api/scripts/create-api-token.ts:38-70`: needs `DATABASE_URL`, `<label>`, `--scopes knowledge:write`,
  optional `--email`; prints the token once. No npm script for it.
- Env expansion in `.mcp.json` `headers`/`url` is `${VAR}`; unset var leaves the literal text (Claude Code docs, code.claude.com/docs/en/mcp).
- Triage screen = route `/knowledge-bit-review` (`apps/web/src/routes/knowledge-bit-review.tsx:9`), shows the source
  subject (`apps/web/src/knowledge-bit/knowledge-bit-review-focus-view.tsx:86`).

## Approach
Docs plus one config entry; no new module, tool or contract. Claude drives the existing tools in a session that
has both servers; the repo ships the runbook and the `.mcp.json` entry. Prod writes are user-run only.

## Steps
1. [I] `.mcp.json`: add `post-anki-prod` after `anki-batch`:
   `{"type":"http","url":"https://post-anki-api-pl6jw2mdla-ew.a.run.app/mcp","headers":{"Authorization":"Bearer ${POST_ANKI_MCP_TOKEN}"}}`.
   No literal token.
2. [I] `apps/anki-batch-mcp/src/mcp-config.test.ts`: add `it` "should read the prod bearer from POST_ANKI_MCP_TOKEN and
   carry no literal token" (type http, exact header string, raw file text has no `pat_`). Keep existing cases.
3. [I] Hashes of skipped notes: run a read-only script from the scratchpad calling `parseAnkiExport` on
   `subjects/Business.txt` (never the server, no write, no `.bak`); collect hashes where `rawText.trim()===""`.
4. [I] Write `.planning/business-anki-import-mcp/runbook.md` (under 80 lines) with these sections:
   - Prerequisites: deploy of staged API changes (migration 0152 via the normal deploy, `release-postanki`); seed.
   - [U] Seed: in a subshell `DATABASE_URL='<neon string>' npm run db:seed:business-sub-subjects -w @post-anki/api`
     expects "N created, M already present"; rerun is a no-op.
   - [U] Token: from `apps/api`, `DATABASE_URL='<neon string>' node --import tsx scripts/create-api-token.ts "anki import"
     --scopes knowledge:write [--email <owner>]` (no `--env-file`, so no local `.env` is read). Run once. The printed `pat_...` value goes
     into `export POST_ANKI_MCP_TOKEN=...` in the shell profile, never a file in the repo; restart Claude Code. Revoke later
     with `npm run db:revoke-api-token -w @post-anki/api`.
   - Check: `/mcp` lists `anki-batch` and `post-anki-prod`; `status` reports 1,685 remaining, `backupExists` after batch 1.
   - Loop (batch size 20): `get_next_batch {size:20}` -> group notes by `deck` -> one `submit_knowledge {deck, notes:[{key:"anki:"+hash,
     text:rawText}]}` per deck, `rawText` unchanged, no rewriting, translating or trimming -> `confirm_batch` only when every deck call
     returned without `isError`. Skip notes with empty `rawText` (list their hashes in the runbook; the `.bak` holds them) and still
     confirm them with the batch. Any `deck: null` or `unknown_deck` -> stop, report the hashes, do not confirm. Stop when `remaining` is 0.
   - Resume: same session, batch id still known -> resend the same notes, expect `alreadyPresent` = note count, then
     `confirm_batch`. New session or restarted server (ids are lost) -> `get_next_batch` hands the same notes under a new
     id, resend, then confirm. `status.pendingBatches > 0` means an open batch exists; do not call `get_next_batch` in the
     same session before settling it (it would skip those notes).
   - First batch check, then stop for the user (see Done when).
5. [I] `apps/api/README.md` Auth section: 3 lines naming `POST_ANKI_MCP_TOKEN` as client-side env var read by
   `.mcp.json`, pointing to the runbook.
6. [U] Deploy, seed, mint token, first batch, then the full loop (runbook order). The autonomous run stops after step 5.

## Tests
- Step 2 only (config guard). No new code, so no other unit tests. Run `npx vitest run` in `apps/anki-batch-mcp`.

## Done when
- [I] `.mcp.json` valid JSON, prod entry present, test green, `npx tsc --noEmit` clean.
- [I] Runbook states batch size 20 and order get_next_batch -> submit_knowledge -> confirm_batch, no rewriting step.
- [I] Runbook lists the 5 skipped hashes, the resume rule and the stop conditions; README names the env var.
- [U] First-batch pass: `created` + skipped = 20 and no `isError`; resending the same notes returns `created: 0`; after detection
  (minutes, detached) `/knowledge-bit-review` shows pending cards whose source subject matches the deck mapping and whose text
  stays faithful to the note; `status.remaining` fell by 20, `.bak` still 8,813 lines.

## Criteria and evidence
1. Runbook: `runbook.md` text with size 20, tool order, no rewrite step [I].
2. One batch on prod: the `submit_knowledge` JSON results, a Triage screenshot or description with subject names, `status`
   before/after, `wc -l subjects/Business.txt` [U].
3. No duplicates after interruption: resend result `created: 0, alreadyPresent: N` (first-batch check) and, if run, a resume
   after a deliberate stop before `confirm_batch` [U].

## Defaults chosen
- Server name `post-anki-prod`: says where it points.
- URL literal, token via env var only: the URL is public config, the token is the secret.
- Explicit `DATABASE_URL` without `--env-file`: a local `.env` can never aim the script at the wrong database.
- Batch size 20 for the first batch too: the todo fixes 20; first 20 may be one deck, so check the deck mapping again on the first batch with a different deck.
- Confirm skipped (empty) notes with their batch: the `.bak` keeps them, so the file can still reach 0.
- Order in first batch: submit, check Triage, resend, confirm: nothing leaves the file before the user has seen the cards.
