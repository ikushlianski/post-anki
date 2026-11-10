# Ingest a .txt file from a button (drop or pick)

Goal
- On the Add knowledge page, a button lets the user drop a `.txt` file or pick it from disk, and it runs through the same ingestion flow as Business.txt (staged notes → Inngest import job → extraction → suggested cards), with progress visible.

What exists
- CLI only: `apps/api/scripts/stage-anki-import.ts` (`npm run db:stage-anki-import <file> --import-id <id> [--send] | --status`), needs DATABASE_URL + INNGEST_EVENT_KEY locally.
- Parser: `apps/anki-batch-mcp/src/anki-export-parser.ts` (`parseAnkiExport`).
- Staging + job: `apps/api/src/anki-import/` (`anki-import-staging.ts`, `anki-import.repo.ts`, `anki-import-inngest.workflow.ts`, `anki-import.events.ts`).
- Web Add knowledge: `apps/web/src/routes/add-knowledge.tsx`, `apps/web/src/knowledge-source/add-knowledge-form.tsx`, client `knowledge-source.api.ts`.
- Router: `apps/api/src/router-table.ts` (`POST /knowledge-sources` etc.).

Scope
- In: an authenticated API endpoint that accepts the file text (+ subject), stages it and sends the import event; a web drop/pick control on Add knowledge; import status shown (staged/imported/extracted counts).
- Anki-export txt (tab-separated, `#separator` headers) goes through the note parser; any other txt becomes one knowledge source.
- Out: native apps (separate todo: app file ingestion), non-txt formats (pdf, docx, .apkg), Notion.

Constraints
- Import id generated server-side; re-uploading the same file must not duplicate notes (reuse the staging dedupe).
- Size limit on the upload; reject non-text files with a plain message.

Done when
- `npx vitest run` for touched api/web files passes; locally (Inngest dev server on :8288) dropping a small Anki txt on Add knowledge creates pending sources that reach `bits_detected`, and the status shows the counts.

Assumptions
- "The flow" = the Business.txt batch import flow.
- Subject chosen in the form; Anki deck names still map to sub-subjects as in the CLI import.
