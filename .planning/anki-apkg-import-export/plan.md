# Anki .apkg import and export

Plan only. No code, no installs. Facts are labelled **Fact** (with source) or **Assumption** (to verify before build).

## 1. Business summary

- The owner can drop an Anki deck file onto the app and see, before anything is saved, how many cards will arrive, under which subjects, and how many already exist.
- On confirm, the decks become subjects (nested decks become sub-subjects), the notes become cards, and every imported card waits in Triage so nothing reaches review unchecked.
- Imported cards start as new (no old Anki progress), which keeps the review queue honest. Carrying progress over is a later, optional step.
- Images and sounds are not imported in the first version. The preview says how many were skipped so nothing disappears silently.
- Export gives the owner one file Anki can open with all approved cards, grouped by subject. A plain-text fallback is offered because it is the lowest-risk path into Anki.
- No AI calls happen during import, so a 5,000-card deck costs nothing until the owner approves cards (approval is when embeddings run).

## 2. What exists today (Facts, from the repo)

- Export today: `GET /knowledge-bits/export?format=json|csv`, streamed, approved cards only, with schedule and review history. Handler `apps/api/src/knowledge-bit/knowledge-bit-export.controller.ts`, reader `knowledge-bit-export.repo.ts`, CSV with formula-injection guard `knowledge-bit-export.csv.ts`. Format enum in `packages/shared/src/knowledge-bit-export.ts`. Web proxy `apps/web/src/routes/api.knowledge-bits.export.ts`; links in `apps/web/src/knowledge-bit/knowledge-overview-download.tsx`.
- Subjects: `apps/api/src/db/schema.ts:31` `subjects` with `parentId` (null = top level). "Parent › Child" is only a display label built in the UI (`apps/web/src/storybook/add-knowledge/lab-data.ts:86`), never stored in the name. So import must create real parent/child rows. `createSubject` (`apps/api/src/subject/subject.repo.ts:261`) takes a per-parent advisory lock but has no find-or-create.
- Card: one `knowledge_bits` row (`schema.ts:1151`, `body` = front + newline + back, `background` = example, `approvalState` pending/approved, `origin` extracted/manual, `sourceLinks`) plus question variants in `knowledge_bit_question_variants` (`kind` wh_question / fill_in_the_blank / basic, `prompt`, `answer`, `sentence`, ordered slot). Every bit hangs off a `knowledge_sources` row (`knowledgeSourceId`, `ordinal` unique per source). Subject comes from the source row (`knowledge_sources.subject_id`).
- The existing manual-card writer (`apps/api/src/knowledge-bit/knowledge-bit-manual-item.repo.ts`) is the pattern to copy: pending, `origin: "manual"`, one basic variant, generation timestamps pre-stamped so no AI variant generation is triggered.
- Fill-blank rule: exactly one `____` run, not touching letters (`knowledge-bit-fill-blank-prompt-validation.ts`).
- Schedule: `knowledge_bit_schedules` (`schema.ts:1297`): ease, intervalDays, dueAt, phase, learningStep, lapses, suspendedAt. Reviews: `knowledge_bit_reviews` (append-only).
- Tags: `tags` and `tag_assignments` (`schema.ts:838`, `849`).
- Duplicate detection for cards: only `findSimilarApprovedKnowledgeBits` (embedding search, `knowledge-bit-approval-embedding.orchestrator.ts:88`). The planned triage dedup (`.planning/card-deduplication/todo.md`) is still unchecked, so there is no finished card duplicate detector to reuse as-is.
- Request bodies: `MAX_BODY_BYTES = 1_000_000`, text only (`apps/api/src/shared/http.ts`). A binary upload needs its own reader. `lambda-handler.ts` passes bodies as base64, so the hosting target decides the real upload ceiling (see decision D1).

## 3. .apkg format facts

- **Fact** (Anki manual, docs.ankiweb.net/manual/exporting): .apkg is a deck package (cards, notes, note types, media) that merges into an existing collection. Export offers "Support older Anki versions", which makes a larger legacy file; modern files compress media and older Anki cannot read them.
- **Fact** (third-party reverse engineering, eikowagenknecht.com "Understanding the Anki APKG Format", not an official spec): legacy package is a zip with `collection.anki2` (a dummy for old clients), `collection.anki21` (real SQLite), `meta` (protobuf), `media` (JSON map of "0","1".. to filenames) and numbered media files.
- **Fact** (ankiR docs and AnkiDroid wiki "Database Structure", schema v11): `notes.flds` holds the fields joined by the 0x1f character; `sfld` is the sort field; `csum` is a checksum of the first field used for duplicate checks.
- **Assumption**: modern export is `collection.anki21b`, a zstd-compressed SQLite file, with media compressed too. One third-party parser (Kioku) names this file and says it does not support it. I found no authoritative description. Must be confirmed against Anki's source (rslib import/export) and with a real modern export before build.
- **Assumption**: legacy tables used: `col` (decks JSON `decks`, note types JSON `models`, creation time `crt`), `notes` (`id`, `guid`, `mid`, `tags` space-separated, `flds`), `cards` (`nid`, `did`, `ord`, `type`, `queue`, `due`, `ivl`, `factor`, `lapses`). Decks nest by `::` in the name. Cloze text looks like `{{c1::answer::hint}}`. Verify on sample files.
- Anki developers advise against reading .apkg outside Anki. Accepted risk: we read only a narrow slice and test against real exports of Anki 2.1.x and the current version.

### Formats to support

1. v1: `collection.anki21` and `collection.anki2` (legacy export), plus `collection.anki21b` if decompression is available without a new dependency (Fact: `zlib.zstdDecompressSync` exists on Node 24.11 locally; repo engines say `>=22`, so confirm the minimum Node 22.x that ships it or raise the engine floor; otherwise D3).
2. Reject with a clear message: `.colpkg` (full collection, different intent), encrypted or unreadable zips, packages where only the dummy `collection.anki2` exists with an "update Anki" placeholder note.
3. Not v1: reading `meta` protobuf (not needed, we detect by file name).

## 4. New dependencies (for approval, none installed)

Checked against `ai-dev/docs/architecture/TECH-STACK-BY-PROJECT.md` (post-anki section): it lists no zip or SQLite reader for post-anki, so all rows are new proposals. `html-to-text` is already approved for `apps/api`; reuse it for field HTML-to-text instead of a hand-written stripper. better-sqlite3 appears only for another project, with native-ABI caveats, which supports preferring sql.js.

| # | Package | Purpose | Recommendation |
|---|---------|---------|----------------|
| 1 | yauzl (or fflate) | Read the zip with per-entry size checks, never writing entries to disk | Approve one. yauzl for streaming and entry validation. |
| 2 | sql.js | Open the untrusted SQLite from memory (WASM sandbox, no native build, works on Lambda/Fargate) | Recommended over better-sqlite3 (native build, file access) and over built-in `node:sqlite` (experimental in Node 22). |
| 3 | zstd decoder | Only if Node built-in zstd is missing for .anki21b | Decide after Node version check. |
| 4 | zip writer (yazl or fflate) | Build the export .apkg | Reuse the same library as #1 if fflate chosen. |
| 5 | Ready-made apkg exporter (e.g. anki-apkg-export) | Would replace hand-building the export | Not recommended until maintenance status is verified; if abandoned we hand-build with #2 and #4 on a fixed schema template. |

No HTML sanitizer dependency is needed if we convert to plain text (strip tags) rather than keep HTML; if rich text must be kept, propose a maintained sanitizer separately.

## 5. Import mapping

Decks to subjects
- Deck name `A::B::C` becomes subject A, child B, grandchild C (displayed "A › B › C"). Match existing subjects by case-insensitive trimmed name under the same parent; create missing ones. Subject kind uses the same default as manually created subjects.
- Skip the empty "Default" deck. Filtered decks: use the original deck (`odid`) when present.
- Depth cap 4 (deeper levels merge into level 4 with a preview warning). Subject creation uses a new find-or-create that takes the same per-parent advisory lock as `createSubject`, so two imports cannot create twin subjects.
- A card in one deck is filed under that deck's subject; a note with cards in several decks uses the deck of its first card (warning shown).

Note types to cards
- Basic: 1 card, basic variant (front = prompt, back = answer).
- Basic (and reversed card) / Basic (optional reversed): one card, two basic variants (forward order 0, reverse order 1), mirroring how one bit holds multiple variants today.
- Cloze: one card per cloze number (c1, c2..), each a fill-in-the-blank variant with one `____` and the original sentence in `sentence`. A cloze number that fails the one-blank rule (adjacent to letters, empty answer) falls back to a basic Q/A built from the sentence; if neither works the note is skipped with a reason.
- Any other note type: use the first two fields as front/back, extra fields appended to `background` (example), flagged "unknown note type" in the preview.
- HTML in fields becomes plain text (tags stripped, entities decoded, `<br>` and block tags to newlines). `[sound:...]` removed. Image tags removed and counted.
- `origin: "manual"`, `isAiGenerated: false`, generation timestamps pre-stamped (as the manual writer does) so no AI variant jobs fire.
- Provenance: one `knowledge_sources` row per imported deck (kind `anki-import`, raw text empty or the filename, status already processed so detection jobs ignore it, subject set). **Assumption**: a free-text `kind` is safe; check the source scanners for `kind` filters before build.

Tags
- Anki space-separated tags become tags via the existing tag repo, assignment source `manual`. Hierarchical `a::b` tags are kept as one flat tag with `::` replaced by ` / `. Cap 20 tags per card, 40 chars each.

Scheduling (recommendation: start as new)
- Default: all cards new, no schedule rows, no review history. Reason: the app's schedule uses its own steps and leech rules (`knowledge-bit-grade-schedule*.ts`); foreign due dates would flood or starve the queue and cannot be checked by the owner.
- Optional later (phase 2, checkbox "keep my Anki progress"): map `ivl` (days), `factor / 1000` to ease, `lapses`, learning state, and `due` converted from days-since-`crt` to a real date; suspended queue to `suspendedAt`. Review log is not imported. Mapping details are **Assumption** until checked on real data.

Media
- v1: skip, with a warning showing the number of image/sound references and the number of media files in the package. Media files are never extracted or written. Reason: the card model has no attachment storage, and media is the main source of zip bombs and path tricks.
- Later: images only, if the app gets attachment storage (separate item).

Dedup (against existing cards and within the file)
- Level 1, free and deterministic (v1): normalized front + back (lowercase, collapsed whitespace, tags stripped) matched against existing `knowledge_bits` bodies plus within-file repeats. Matches are skipped by default; the preview shows the count and the owner can include them.
- Level 2, optional and paid: embedding similarity via the existing similarity search, run after import through the normal approval embedding flow, not inline. Reason: 5,000 inline embedding calls make import slow and costly. Flagging near-duplicates in Triage belongs to the card-deduplication item; this plan only guarantees Level 1.
- Re-importing the same file adds zero cards (Level 1 makes import idempotent).

Approval state (recommendation: pending)
- All cards land as `pending`. They appear in Triage and the owner can use the existing bulk approve. Reason: matches manual cards; keeps cost deferred (embedding runs at approval); gives a safe undo window (existing triage undo). The confirm step offers "approve all now" as an explicit checkbox, off by default, using the existing bulk-approval path (so its rules still apply).

## 6. Limits and untrusted-file safety

Everything in the file is untrusted data, including card text (later read by AI tagging and embedding; treated as data, never as instructions; no LLM call at import).

- Upload ceiling 50 MB compressed (D1 may force lower). Reject before parsing when over.
- Zip: read only entries named `collection.anki21b`, `collection.anki21`, `collection.anki2`, `media`, `meta`; all other entries are counted, never read or written. No entry name is ever used as a filesystem path, so path traversal (`../`) has no target. Reject if entry count over 100,000. Cap uncompressed size of the collection at 300 MB and of `media`/`meta` at 5 MB by counting bytes while decompressing (not trusting declared sizes), abort at the cap (zip bomb). Reject encrypted entries and zip64 oddities beyond the caps.
- SQLite: opened from memory in the WASM engine, read-only, never written to disk. Only a fixed set of SELECT statements written by us run; nothing from the file (triggers, views, SQL in fields, note-type templates, JS) is ever executed or evaluated. Check `PRAGMA integrity`-style failures as "unreadable file".
- Row caps: 50,000 notes, 200,000 cards, field text 20,000 characters (longer notes skipped with a reason), 500 decks. Over a cap: reject the file with the cap named.
- Parse inside a worker thread with a memory limit and a 60 s timeout so a hostile file cannot stall the API; the main process only receives plain parsed JSON validated by Zod.
- Writes: chunks of 500 cards per transaction; safe to retry because of Level 1 dedup. Subject find-or-create under advisory lock. Import is one request per file; a second import running at once for the same user is refused with "import already running" (simple in-process lock plus the dedup safety net).
- Logs: counts and reasons only, never card text.

## 7. API contract (shared Zod in `packages/shared/src/anki-import.ts`)

- `POST /anki-imports?dryRun=true|false` with the raw file as `application/octet-stream` (not multipart, avoids another parser dependency), header `x-file-name`. Same endpoint for preview and commit: the commit re-uploads the same file (no staging table, no stored untrusted file). Resource noun is plural; verb is the HTTP method.
- Query options on commit: `startAs=new` (later `keepProgress`), `approval=pending|approved`, `includeDuplicates=false`.
- Response (both modes): `totals {decks, notes, cards, toImport, duplicates, skipped}`, `decks[] {ankiPath, subjectPath ("A › B"), subjectExists, notes, cards, duplicates}`, `skipped[] {reason, count}` (unknown note type, cloze not convertible, too long, empty), `warnings[] {code, count}` (media_skipped, deck_depth_merged, multi_deck_note), `format` (anki21 / anki2 / anki21b). Commit adds `created {subjects, cards, tags}` and `triageUrl`.
- Errors (400/413/422 with machine code): `file_too_large`, `not_an_apkg`, `colpkg_not_supported`, `unsupported_format`, `limits_exceeded {limit}`, `import_already_running`. Server errors never echo file contents.
- Export: extend `GET /knowledge-bits/export?format=` with `apkg` and `txt`, optional `scope=approved|all`.

## 8. Web UI flow

1. Next to the "Download my cards" links, add an "Import from Anki" button opening `/knowledge/import`.
2. Step 1: choose or drop one .apkg (client checks extension and size before sending). Plain explanation of what is and is not imported.
3. Step 2: preview after the dry run: totals line ("1,240 cards from 12 decks, 38 already in your library, 15 skipped"); deck table mapping each Anki deck to a subject path with a "new" or "existing" badge; collapsible skipped reasons; media warning banner.
4. Options: start as new (only choice in v1, disabled with a "coming later" note for progress), "include cards I already have" off, "approve all now" off.
5. Confirm shows progress, then a result with counts and a link to Triage.
6. Failures show the error code mapped to a human sentence; the file is never kept on the server.
- The web server route (`apps/web/src/routes/api.anki-imports.ts`) streams the upload through to the API with the existing auth headers, like the export proxy does in reverse.

## 9. Export file format

- Primary: `.apkg` in the legacy layout Anki still opens: zip with `collection.anki2` (schema v11, built from a fixed template, not copied from user data), `media` containing `{}`, no media files. **Assumption**: current Anki imports this layout; must be proven by opening the output in a current Anki desktop and in AnkiDroid before release.
- Decks: one deck per subject path, `Parent::Child`. Note types: Basic for basic and wh_question variants (example and source links appended to the back), Cloze for fill-in-the-blank (`{{c1::answer}}` built from `sentence`). One note per variant of a bit, so nothing is lost.
- Tags: card tags, spaces replaced by underscores (Anki tags cannot contain spaces).
- Stable `guid` derived from bit id + variant id, so exporting twice and re-importing into Anki updates rather than duplicates (**Assumption**: Anki matches by guid; verify).
- Scheduling: v1 exports all as new. Phase 2 maps schedule to `ivl/factor/due` for round trip.
- Fallback `txt`: tab-separated plain text (Anki "Notes in Plain Text" import): front, back, tags, deck columns, with the existing formula-prefix guard from `knowledge-bit-export.csv.ts`. Needs no dependency and is the safe path if `.apkg` building proves brittle.
- Size: the SQLite is built in memory, so cap at 50,000 cards per file; above that the UI suggests `txt` or a per-subject export. Scope default is approved cards (same as today); `scope=all` includes pending.

## 10. Tests as business guarantees (vitest, co-located; real sample packages as fixtures)

Fixtures: small hand-built legacy .apkg (Basic, reversed, Cloze, nested decks, tags, an image), a modern-format package, a zip bomb, a path-traversal zip, a package with a hostile SQLite (triggers, view).

- Dry run saves nothing: row counts for subjects, bits, sources, tags are identical before and after.
- A nested deck `Languages::Spanish::Verbs` yields three levels shown as "Languages › Spanish › Verbs", and re-using an existing "Languages" does not create a twin.
- Two imports racing on a brand-new parent subject create exactly one subject.
- Basic gives one card; reversed gives one card with a forward and a reverse question; a two-cloze note gives two fill-blank cards each with exactly one blank.
- Imported cards are pending, tagged manual origin, with no schedule rows, and none trigger AI variant generation.
- Importing the same file twice adds zero cards the second time and reports them as duplicates.
- A card whose text equals an existing card (different case and spacing) is skipped by default and included when the owner asks.
- Media references are removed from text and reported as a warning; no file is written anywhere.
- Zip bomb is rejected at the byte cap, never held fully in memory; path-traversal entry names write nothing; hostile SQLite triggers do not run.
- Over-limit note count, over-long field, .colpkg and non-zip files each give their specific error and change nothing.
- Failure halfway through leaves earlier chunks saved, reports the count, and a retry finishes without duplicates.
- HTML and script in a field is stored as inert plain text.
- Export: approved-only by default; a Cloze round-trip keeps the blank; subject paths become `::` decks; tags with spaces are made valid; stable guids across two exports; the output opens in current Anki (manual check, recorded in the manual-test sequence).
- Round trip: export then import into an empty library recreates the same subjects and cards, with zero duplicates on a second import.
- Web (testing-library): preview shows counts and per-deck subject paths; confirm disabled until a preview succeeded; error code shows a readable message.

## 11. File ownership (new code; no source edited in this planning step)

API
- `apps/api/src/anki-import/anki-import.controller.ts`: upload read, limits, dryRun switch.
- `anki-package.reader.ts`: zip entry allowlist, byte-capped decompression; `anki-collection.reader.ts`: fixed SELECTs via the in-memory engine; `anki-parse.worker.ts`: worker entry with timeout.
- `anki-note-mapper.ts`, `anki-cloze.ts`, `anki-html-to-text.ts` (thin wrapper over the approved `html-to-text`), `anki-deck-path.ts`: pure mapping (unit tested).
- `anki-import-dedup.ts`, `anki-import.repo.ts`: normalized-text match, chunked writes, subject find-or-create, source rows, tag assignment.
- `apps/api/src/anki-export/anki-export.controller.ts`, `anki-collection.writer.ts`, `anki-export-note-mapper.ts`, `anki-txt.writer.ts`.
- Register routes in `apps/api/src/router-table.ts`; extend export dispatch in `knowledge-bit-export.controller.ts` only to hand off the two new formats.
Shared
- `packages/shared/src/anki-import.ts` (request, preview, error schemas); extend `knowledge-bit-export.ts` enum.
Web
- `apps/web/src/anki-import/` (screen, preview table, upload hook), route `apps/web/src/routes/knowledge.import.tsx`, proxy `apps/web/src/routes/api.anki-imports.ts`; add the button in `knowledge-overview-download.tsx`; add `apkg`/`txt` links there.
- Schema: no new table, no migration (provenance via `knowledge_sources`).

## 12. Architecture changes (data contracts and boundaries)

- New boundary: untrusted-package parsing is isolated (worker, byte caps, fixed queries) and only emits validated plain JSON to the importer.
- New contract: a binary upload endpoint with dry-run/commit symmetry; export gains two formats.
- New capability: find-or-create subjects by path under the existing per-parent lock.
- `knowledge_sources.kind` gains the value `anki-import`.
- No change to scheduling, triage, or approval rules.

## 13. Decisions for the owner

- D1. Hosting ceiling: if the API still runs behind Lambda, request bodies are capped near 6 MB, which blocks real decks; the Fargate plan (`.planning/api-deployment-fargate-spot`) lifts it. Recommended: ship import after Fargate, or accept a small limit until then.
- D2. Approve dependencies 1, 2, 4 in section 4 (and 3 only if needed).
- D3. If Node built-in zstd is unavailable, approve a zstd decoder or drop .anki21b from v1 (users then export "Support older Anki versions").
- D4. Confirm defaults: new-only, pending, media skipped, images later.

## 14. Order of work

1. Pure mappers and the package reader with fixtures (safety tests first).
2. Dry run endpoint and preview UI.
3. Commit path with dedup, chunking, subjects, tags.
4. Export `txt`, then `apkg` with the manual open-in-Anki check.
5. Phase 2: keep-progress mapping both ways.

END-OF-REPORT
