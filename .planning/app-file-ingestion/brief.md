# File ingestion from the native apps

Goal
- Mac (picker + drop) and iPhone (Files picker) ingest a `.txt` file via `POST /text-file-imports` {text, subjectId} and poll `GET /text-file-imports/:importId`, same states as web: uploading, counts, done, errors.

Architecture
- API package: `text-file-import-client.swift` (new file per feature, `APIClient.uploadTextFile` / `textFileImportStatus`, models) and `text-file-import-rules.swift` (size/extension check, server error codes to plain messages).
- Shared UI: `TextFileImportModel` (read file, validate, upload, poll every 3s until finished) and `AddKnowledgeFileImport` card inserted in the add-knowledge screen under the subject picker, using the screen's effective subject.
- Mac: `dropDestination(for: URL)`; sandbox entitlement `files.user-selected.read-only` on the Mac app entitlements.

Rules
- Finished = staged 0, imported > 0, finished >= imported; `finished` counts bits_detected, failed and discarded sources (API returns it next to `extracted`).
- Client limits match web: .txt only, non-empty, max 900 KB.

Out: Expo app, other formats, share extension.
