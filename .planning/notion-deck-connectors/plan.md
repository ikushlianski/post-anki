# notion-deck-connectors: plan

Source of truth: the `notion-deck-connectors` block in `.planning/TODO.md` (line 1129). Nothing is built yet. No real Notion call is made while building; the real run needs the items under "What you must provide".

## Goal

The user keeps a list of Notion pages as ingestion sources. Each has a target subject, an items-per-run cap, a frequency and a keep-or-remove-after-import switch. It can be paused, edited, deleted and run on demand. A scheduler runs due sources unattended. The English meeting-phrases page is the first source and feeds the existing phrases path.

## What exists (reused, nothing parallel)

- Phrases path (built): `POST /knowledge-sources/phrases` (`apps/api/src/knowledge-source/phrase-knowledge-source.controller.ts`), `parsePhraseLines` (`packages/core/src/meeting-phrase/parse-phrase-lines.ts`), unique `import_key` dedupe, `kickSourcesAfterAdd`, `ensureEnglishForItSubject`, prompt escaping in the phrase agent.
- Notion reads and deletes: `apps/api/src/notion-connector/notion.client.ts` (`@notionhq/client`, already an apps/api dependency, token from `NOTION_TOKEN`), `removeNotionItem` in `notion-sync.orchestrator.ts`, `itemsFromBlocks` in core. That file-driven connector (`notion-connectors.json`, macOS LaunchAgent, facts and CRM routing) and the biz-education distiller stay as they are (the TODO calls them separate pipelines).
- Hosting and scheduling in use: API on GCP Cloud Run (`docs/architecture/cold-start-options.md`); schedules are Cloud Scheduler jobs in `infra/index.ts` that POST to the API with the `apiSharedSecret` bearer (example: `bizEducationDistillJob`, `*/15 * * * *`). Lambda and Fargate exist as alternatives, not as the live path.
- Secrets today: plain env vars set in `.github/workflows/deploy.yml` (`--set-env-vars`); `NOTION_TOKEN` is not wired into the deployed API yet. No encryption helper and no stored third-party credential exist. `app_settings` is returned whole by `GET /admin/settings`, so no secret goes there.
- Spend guard: `assertLlmBudgetAvailable` / `LlmBudgetExceededError` (`apps/api/src/shared/spend-guard.ts`, `LLM_DAILY_BUDGET_USD`); extraction already pauses with `llm_budget_paused`.
- Client patterns: web `routes/admin-settings.tsx` plus `admin-settings/admin-settings.api.ts` (server fns over `curriculum/api-client`); iOS/Mac `APIClient+<Feature>.swift` in `Packages/PostAnkiAPI`, shared screens in `apps/ios/Sources/Shared`, Mac features in `Sources/PostAnkiMac/Features/*` (steps in `apps/ios/docs/ARCHITECTURE.md`, "Add a Mac feature").
- `.product/DECISIONS.md` has no Notion entry. `TECH-STACK-BY-PROJECT.md` does not list `@notionhq/client` (the TODO note asks for approval; `docs/architecture/paid-services.md` lists it).

## Approach

New entity folder `apps/api/src/notion-ingestion/`. One small interface hides Notion; the runner never imports the SDK:

```ts
interface NotionPageGateway {
  readItems(pageId: string, maxBlocks: number): Promise<{ id: string; text: string }[]>;
  removeItems(pageId: string, itemIds: string[]): Promise<{ removed: string[]; failed: string[] }>;
  checkConnection(): Promise<{ ok: boolean; workspaceName: string | null }>;
}
```

Implementations: `notion-api.gateway.ts` (real, wraps `readSourceItems` and `removeNotionItem`, builds a client from the resolved token on each run, no module cache) and `fake-notion-page.gateway.ts` (in memory, records deletions, can be told to fail). The runner receives the gateway as an argument.

- Run for one source: claim it, check the budget, resolve the token, read items, turn each into a phrase key, drop keys already imported, take the first N new ones, import through one shared function, then remove from Notion only the ones this run imported and only if the switch is on.
- "Items per run" means new items per run. Already-imported lines are skipped before counting, so a keep-mode page does not get stuck on its first N lines.
- Scheduling: one Cloud Scheduler tick every 15 minutes calls `POST /notion-source-runs`; the API decides which sources are due. One job, not one per source (15 jobs already exist). `next_run_at` is set when a run is claimed with one atomic update, so a scheduler retry cannot run a source twice.
- Credential: stored in the database as AES-256-GCM ciphertext (Node `crypto`, no dependency), key from env `CONNECTOR_SECRET_KEY`. Falls back to `NOTION_TOKEN` when nothing is stored. The API only ever says whether a token is set and where it comes from.
- Pipeline: `pipeline` column with one value, `meeting_phrases`, which calls the shared phrase import with the source's subject. More pipelines are later work.
- No new dependency. No change to the phrases contract beyond extracting its body into a function.

## Contracts (packages/shared/src/notion-ingestion-source.ts, exported from the index)

- `notionSourceFrequency = "manual" | "daily" | "nightly"`; `daily` = 24 h after the last run, `nightly` = next 01:00 UTC.
- `notionIngestionSource`: `id, name, pageUrl, subjectId, subjectPath (read only), itemsPerRun 1..100, frequency, removeAfterImport, paused, nextRunAt, lastRun: { status, finishedAt, imported, removed } | null`.
- `createNotionIngestionSourceInput`: `name, pageUrl, subjectId, itemsPerRun (default 20), frequency (default manual), removeAfterImport (default false)`. Update input is the same fields, all optional, plus `paused`.
- `notionRunResult`: `status ok | partial | failed | skipped_budget | skipped_no_connection, read, imported, skippedExisting, ignored, removed, removeFailed`.
- `notionConnectionStatus` (strict): `configured, origin "settings" | "env" | "none", canStoreToken`. Input `{ token: string.min(1).max(500) }`. No response schema has a token field.
- `isNotionPageUrl`: https only, host `notion.so`, `www.notion.so` or `*.notion.site`, a 32-hex id extractable (via `extractNotionId` on the API side). The URL is never fetched; only the id goes to Notion, so there is no server-side request to a user-given host.

## Routes (apps/api/src/router.ts, router-table.ts, api-server.ts, router.test.ts)

- `GET /notion-sources`, `POST /notion-sources`, `PATCH /notion-sources/:id`, `DELETE /notion-sources/:id` (deleting a source never touches Notion or already-imported cards).
- `POST /notion-sources/:id/runs` (Ingest Now, runs inline, 409 `already_running` if a run started in the last 10 minutes and has not finished).
- `POST /notion-source-runs` (scheduler tick; runs all due, unpaused, non-manual sources one by one).
- `GET /notion-connection`, `PUT /notion-connection`, `DELETE /notion-connection`, `POST /notion-connection/checks` (calls `checkConnection`).

## Steps

Each slice is built, tested and reviewed on its own, in this order. Run `npx tsc --noEmit` and lint before each commit.

### Slice 1: data model, contracts, CRUD (backend)

1. `packages/shared/src/notion-ingestion-source.ts` (+ `.test.ts`) and export from `packages/shared/src/index.ts`.
2. `apps/api/src/db/schema.ts`: add `notionIngestionSources` (`id, name, page_id` unique, `page_url, subject_id` fk subjects, `pipeline` default `meeting_phrases`, `items_per_run, frequency, remove_after_import` default false, `paused` default false, `next_run_at, created_at, updated_at`), `notionIngestionRuns` (`id, source_id` fk cascade, `trigger, status, read_count, imported, skipped_existing, ignored, removed, remove_failed, error_code` text code only, `started_at, finished_at`) and `connectorSecrets` (`name` pk, `ciphertext, updated_at`).
3. Generate with `npm run db:generate:api`; commit the generated SQL and `meta` files; apply with `npm run db:migrate:api` against the local database only. Never push through the ORM; no production migrate.
4. `apps/api/src/notion-ingestion/notion-ingestion-source.repo.ts` and `.controller.ts`: list, create, patch, delete. Create validates the URL, stores the extracted `page_id`, checks the subject with `findSubjectAssignmentError`, sets `next_run_at` from the frequency. Patching frequency or un-pausing recomputes `next_run_at`; pausing leaves it. Duplicate page id returns 409 `page_already_added`.
5. `apps/api/src/notion-ingestion/next-run-at.ts` (+ test): pure schedule math.
6. Routes wired as listed above.

### Slice 2: runner, gateway, Ingest Now, first source (backend)

7. `apps/api/src/knowledge-source/phrase-import.service.ts`: move the controller body into `importPhraseLines({ lines, subjectId })`, returning the existing result plus `importedKeys`. `phrase-knowledge-source.controller.ts` calls it (the endpoint's behaviour and tests stay the same).
8. `apps/api/src/notion-ingestion/notion-page.gateway.ts` (interface), `notion-api.gateway.ts`, `fake-notion-page.gateway.ts`.
9. `apps/api/src/notion-ingestion/run-notion-source.ts`: the run described in Approach. Lines over 500 characters count as `ignored`. A page is read up to `MAX_PAGE_BLOCKS = 500` blocks. Removal runs only when `removeAfterImport` is true, only for item ids whose key is in `importedKeys`, after the import call returned; each removal logs `notion_item_removed` with source id and block id (never the text or token); a failed removal logs `notion_item_remove_failed`, counts in `removeFailed`, sets status `partial`, and never undoes the import.
10. Budget: call `assertLlmBudgetAvailable()` before reading Notion; on `LlmBudgetExceededError` write a run with `skipped_budget`, import nothing, and leave `next_run_at` as it was so the next tick retries.
11. `apps/api/src/notion-ingestion/notion-source-run.controller.ts`: `POST /notion-sources/:id/runs`. Run rows are written at start (`running`) and finished at the end; a thrown error stores only a short code, not the provider message.
12. `apps/api/scripts/register-notion-source.ts` + npm script `notion-sources:register` (arguments: page URL, `--english-phrases`): calls `ensureEnglishForItSubject()` and creates the source through the same repo function with `meeting_phrases`, `itemsPerRun 20`, `nightly`, removal off. The URL is an argument, never committed.

### Slice 3: connection settings and credential (backend)

13. `apps/api/src/shared/env.ts`: optional `CONNECTOR_SECRET_KEY` (base64, 32 bytes, validated when present). `.env.example` gets a placeholder line.
14. `apps/api/src/notion-ingestion/connector-secret.crypto.ts` (+ test), `connector-secret.repo.ts`, `notion-connection.controller.ts`, `resolve-notion-token.ts` (stored token first, then `NOTION_TOKEN`).
15. `apps/api/src/shared/log.ts`: add pino `redact` for `token`, `*.token`, `req.headers.authorization`. Nothing in the new code logs request bodies.
16. `PUT` without `CONNECTOR_SECRET_KEY` answers 409 `secret_key_missing` (the screens then say to set it in the server environment). `POST /notion-connection/checks` returns `{ ok, workspaceName }` only.
17. Add one entry to `.product/DECISIONS.md`: token in the database, encrypted, with env fallback, and why the Notion-hosted MCP is not used unattended.

### Slice 4: scheduler (backend and infra)

18. `apps/api/src/notion-ingestion/run-due-notion-sources.ts` (+ `notion-source-run.controller.ts` handler for `POST /notion-source-runs`): select unpaused sources with `frequency <> manual` and `next_run_at <= now()`, claim each with `UPDATE ... WHERE id = $1 AND next_run_at <= now() RETURNING`, run them one at a time, stop the tick early if a run returns `skipped_budget`. Returns a list of run results. A failure in one source never stops the others.
19. `apps/api/scripts/notion-sources-run.ts` + npm script `notion-sources:run`: same function for local use.
20. `infra/index.ts`: add `notionSourceTickJob` (`notionSourceTickSchedule`, default `*/15 * * * *`, `attemptDeadline` 300s, bearer `apiSharedSecret`), modelled on `bizEducationDistillJob`; export its name. `.github/workflows/deploy.yml`: pass `CONNECTOR_SECRET_KEY` with `--set-env-vars`. Both take effect only when the user deploys.
21. Docs: add a "Notion sources" section to `apps/api/src/knowledge-bit/ingestion-pipeline.md` (current behaviour only).

### Slice 5: web

22. `apps/web/src/notion-source/notion-source.api.ts` (server fns, same style as `admin-settings.api.ts`; export `request` from `curriculum/api-client` if it is not exported yet).
23. `apps/web/src/routes/notion-sources.tsx` (loader lists sources), `notion-source-list.tsx` (name, subject path, frequency, last run, paused badge, Edit, Pause/Resume, Ingest Now, Delete), `notion-source-form.tsx` (URL, subject choice reusing `knowledge-source/use-knowledge-subject-choice.ts`, items per run, frequency, remove-after-import toggle default off with the sentence "Imported items are deleted from Notion. Off keeps the page unchanged."), `notion-run-result-text.ts` (plain sentences per status). Delete uses a confirm step.
24. `apps/web/src/admin-settings/notion-connection-panel.tsx`, rendered on `routes/admin-settings.tsx`: write-only password field, "Token saved: yes/no, from settings or server environment", Save, Remove, Test connection. The field is cleared after save and never prefilled.
25. Sidebar link in `apps/web/src/nav/sidebar.tsx` and its test.

### Slice 6: iOS

26. `Packages/PostAnkiAPI/Sources/PostAnkiAPI/NotionSourceModels.swift`, `APIClient+NotionSources.swift` (list, create, update, delete, run, connection status, save token, remove token, check), fixtures and decoding tests in `Packages/PostAnkiAPI/Tests/PostAnkiAPITests`.
27. `apps/ios/Sources/Shared/`: `notion-sources-model.swift` (load, save, run, per-row busy and failure states, following `admin-settings-model.swift`), `notion-sources-screen.swift`, `notion-source-form.swift` (subject choice from `add-knowledge-subject-picker.swift`), `notion-connection-section.swift` (secure field, never shows a saved token).
28. iOS entry: a `notionSources` case in `Sources/Shared/more-destination.swift` (section `library`), screen hosted from the More screen.

### Slice 7: native Mac

29. `Sources/PostAnkiMac/Library/MacNotionSourcesView.swift` using `MacLoadStateView`, `MacEmptyStateView`, `macConfirmDestructive` for delete, Cmd-R reload; feature entry in `Sources/PostAnkiMac/Features/MacLibraryFeatures.swift` (unique id `notion-sources`, no shortcut).
30. Smoke tests in `apps/ios/Tests/PostAnkiMacSmokeTests` for load, failure, run and cancellation with `FakeServerSession`. Run `xcodegen generate`, build both schemes, run the registry tests, then rebuild and relaunch the dev copy with `apps/ios/scripts/run-mac.sh` and update the sidebar list in `apps/ios/README.md`.

## Tests (vitest; co-located; Swift as listed)

- `next-run-at.test.ts`: manual gives null; daily is 24 h later; nightly picks the next 01:00 UTC before and after that hour.
- `notion-ingestion-source.test.ts` (shared): URL accepts `notion.so`, `www.notion.so`, `*.notion.site` pages; rejects http, other hosts, `notion.so.evil.com`, and links without an id.
- `run-notion-source.test.ts` with the fake gateway: caps new items at N; skips already-imported lines before counting; leaves the page untouched when the switch is off; removes exactly the imported items when on; does not remove an item whose import failed or was skipped; a failing removal gives `partial` and keeps the import; budget error gives `skipped_budget` with nothing read or imported; no token gives `skipped_no_connection`; repeated run adds nothing.
- `run-notion-source.integration.test.ts`: two ticks claiming the same source run it once; deleting a source keeps its imported cards.
- `connector-secret.crypto.test.ts`: round trip; wrong key fails; two encryptions of one token differ.
- `notion-connection.controller.test.ts`: status, save, remove and check responses never contain the token (search the serialized body); a 409 without the key; env fallback reports `origin "env"`.
- Controller tests for sources: validation errors, duplicate page, unknown subject, patch recomputes `next_run_at`, pause stops the tick selecting it, delete.
- `phrase-knowledge-source.controller.test.ts` and its repo test stay green after step 7.
- Log check in `run-notion-source.test.ts`: a removal logs source id and block id and no item text or token.
- Web: list renders states and actions; form defaults keep removal off and sends it only when toggled; token field is empty after save; the panel never shows a stored value.
- Swift: model load, failure and cancellation paths, decoding of every fixture, token never stored in model state after save.

## Done when

- A source can be added, edited, paused, resumed, deleted and run on demand from web, iOS and Mac; the remove-after-import switch is on each form and defaults to off.
- With the fake gateway, a nightly source becomes due, runs once per tick, imports at most N new phrases into its subject and removes from the page only what it imported, only when the switch is on.
- The English phrases source can be registered with `notion-sources:register` and its phrases arrive as pending cards under English / English for IT.
- No API response, log line or client state contains the token.
- A run with the daily budget used up imports nothing and records `skipped_budget`.
- `npx tsc --noEmit`, lint and `npx vitest run` pass in api, web, core and shared; Swift builds and tests pass; the migration is applied to the local database only.

## What you must provide for the real run

- A Notion internal-integration token. Read access is enough unless a source turns removal on, which needs edit access (the existing removal code deletes blocks).
- The integration added to each page (page menu, Connections), and the English phrases page URL.
- `CONNECTOR_SECRET_KEY` (for example `openssl rand -base64 32`) in `apps/api/.env.local` and as a deploy secret; then the token pasted once in Admin settings.
- Running `pulumi up` for the new scheduler job and a deploy; both are production changes and are not done by the build.
- A line for `@notionhq/client` in `TECH-STACK-BY-PROJECT.md` (it is already installed; the file is outside this repo).

## Risks

- Cost: a first run over a long page would call the model once per phrase. Caps: N per run (default 20, max 100), the budget check before each run, and the daily guard inside extraction.
- Data loss: removal is the only destructive step. It runs only after a successful import, only for this run's items, only with the switch on, and is logged. A token with edit access that is shared with the page is required, so the default stays off.
- "Imported" means the raw source row is stored. If extraction fails later, the Notion item is already gone, but the raw text stays in the database and can be regenerated (the existing regeneration route).
- Lines already imported while removal was off stay in Notion after the switch is turned on; only new imports are removed.
- Prompt injection: page text is untrusted. It reaches the model only through the phrase agent, which escapes tags and has no tools; output is schema-checked. Line length is capped.
- Notion edits between read and delete: deletion is by block id, so an edited line is still deleted after import. Accepted.
- Cloud Scheduler jobs on `api.postanki.ilya.online` currently report error code 13 (`cold-start-options.md`). Verify the new job actually reaches the API before relying on it.
- The `.xcodeproj` is generated; new Swift files need `xcodegen generate`.

## Defaults taken

- Credential in the database, encrypted, with env fallback: no stored third-party secret exists, an env-only token cannot be "configured in settings", and `app_settings` is returned whole.
- Real gateway uses the Notion API with an integration token, not the MCP protocol: Notion's hosted MCP needs an interactive login, which an unattended run cannot do. The interface lets an MCP gateway replace it later.
- One scheduler tick every 15 minutes, with the due check in the API: avoids a job per source and matches the existing 15-minute pattern.
- Frequencies are manual, daily and nightly: the three the user named.
- Unique page per source: a page in two places would import the same lines twice.
- One subject id (the leaf) per source, shown as a path: sub-subjects are subjects with a parent.
- Items per run default 20, maximum 100: equals the phrases endpoint cap.
- The manual run also respects the budget guard: same cost risk as a scheduled one.
- Removal targets only items imported in this run, not already-existing ones: the safe reading of "successfully imported".
- Deleting a source leaves Notion and cards untouched: deletion means "stop watching".
- Paused sources are skipped by the tick but can still be run with Ingest Now: pause stops the schedule, not the user.
- Web places the connection panel on Admin settings, the sources list on its own page: matches where settings live today.
- Old file-driven connector left alone: it routes facts and CRM notes, a different destination.
