---
type: architecture
domain: extension
component: highlight-capture
state: as-built
updated: 2026-10-29
---
# Highlight capture (Chrome extension)

## What it does

A learner selects text on any web page, right-clicks, and chooses "Send to post-anki". The extension posts the selected text to the API together with the page url, the page title and the saved default subject (when one is set). The API stores it as a pending knowledge source, the same kind that a paste in the add-knowledge page creates, and starts the detection pipeline.

The extension shows the outcome in two places. The toolbar badge shows OK, DUP or ERR for 4 seconds, and its title carries the detail. A toast is injected into the page for the same outcome.

When no default subject is saved, the capture has no subject.

## Parts

All under `apps/extension/`. It is a plain TypeScript Manifest V3 package with no UI framework and no content script.

- `public/manifest.json`: permissions are `contextMenus`, `storage`, `activeTab` and `scripting`. `host_permissions` lists `http://localhost:5560/*` and `http://127.0.0.1:5560/*`, the default API address. `activeTab` and `scripting` exist only to inject the toast into the tab where the learner used the menu. The manifest carries a `key`, so the extension id is stable. It runs `background.js` as a module service worker, declares the options page and an action with the title "post-anki capture".
- `src/background.ts`: creates the context menu item on install, limited to selections. On click it builds the text, sends it, sets the badge and shows the toast. A click on the toolbar button retries the pending capture when one exists, and otherwise opens the web review page.
- `src/capture/build-capture-text.ts`: trims the selection (blank gives `empty_selection`) and cuts it to 50,000 characters. The body carries `text`, plus `sourceUrl` (only `http:` and `https:`, without the `#fragment`, at most 2,048 characters), `title` (at most 300 characters) and `subjectId` when they are present.
- `src/capture/send-capture.ts`: `POST <baseUrl>/knowledge-sources` with the body as JSON and a 15-second timeout. It adds `Authorization: Bearer` only when a token is saved. A 201 gives `ok`. A 400, 401, 403, 409, 413 or 429 gives `bad_request`, `unauthorized`, `forbidden`, `already_added`, `too_large` or `rate_limited`. Any other status gives `unexpected` and a network error gives `network`. The function never throws and never logs the text.
- `src/capture/run-capture.ts` and `src/capture/pending-capture.ts`: a `network` failure or a 5xx answer keeps the body in `chrome.storage.session` as the pending capture. Any other outcome clears it. Clicking the toolbar button sends the pending capture again and reports the new outcome.
- `src/feedback/`: `describe-send-result.ts` maps a result to the badge and title (for example "Token rejected (401)", "Extension not allowed (403): set EXTENSION_ID in the API env", "API not reachable at <url>"). A retryable failure adds "Click the toolbar button to retry." to the title. `describe-toast.ts` and `show-toast.ts` build and inject the toast, which reports success, "Already in Post Anki", a missing or rejected token, an unreachable server and the other failures. `open-review-tab.ts` opens `<web url>/knowledge-bit-review`.
- `src/settings/settings.ts`: stores `{ baseUrl, token, subjectId }` under the `settings` key in `chrome.storage.local`, and the web app address under `webUrl`. The base URL defaults to `http://localhost:5560` and the web address to `http://localhost:5540`. Both must be http or https and lose trailing slashes. The token and the subject are optional.
- `public/options.html`, `src/options.ts` and `src/options-form.ts`: a form with four fields (API base URL, web app address, optional token, optional default subject). Enter or the Save button submits the form. Save is disabled while it runs, the status line reads "Saved." or names the invalid address, and any edit clears the status. After a save the subject list reloads from the saved address and token.
- `src/subjects/`: `fetch-subjects.ts` reads `GET <baseUrl>/subjects` and answers with the list or a reason (`unauthorized`, `forbidden`, `network`, `other`). `load-subjects.ts` fills the subject dropdown and, on failure, shows a note that names the reason: "Token rejected (401)", the missing `EXTENSION_ID`, "API not reachable at <url>" or "API error (<status>)".

## API side

- `POST /knowledge-sources` is in `apps/api/src/router-table.ts`. The single-text branch of `apps/api/src/knowledge-source/knowledge-source.controller.ts` trims the text, rejects empty text, rejects text over 50,000 characters, checks the subject, prepends a `Page: <title>` line to the stored text, keeps a safe `sourceUrl` with the source, answers 409 when the same text already exists in the subject, inserts the source, and then starts the pipeline.
- Authentication (`authorized()` in `apps/api/src/api-server.ts`): when `API_SHARED_SECRET` is unset, every request passes. When it is set, a `Bearer` header must match the shared secret or an active API token. The extension sends whatever the learner pasted into the options page.

## Origin allow-list

Browser-origin checks run in `createApiServer()` in `apps/api/src/api-server.ts`, before the OPTIONS handling and before authentication. `resolveCorsDecision` in `apps/api/src/shared/cors.ts` decides:

- No `Origin` header (curl, server-side callers): allowed, and the response names `WEB_ORIGIN`.
- `Origin` equals `WEB_ORIGIN` (default `http://localhost:5540`): allowed, and echoed.
- `Origin` equals `chrome-extension://<EXTENSION_ID>`: allowed, and echoed. This entry exists only when `EXTENSION_ID` is set.
- Any other `Origin`: 403 `{ "error": "origin_not_allowed" }`.

The comparison is exact string equality. There is no wildcard. `Vary: Origin` is set on every allowed response.

`EXTENSION_ID` is declared in `apps/api/src/shared/env.ts` as an optional non-empty string. `apps/api/.env.example` lists it commented out.

## Loading the extension and setting the ID

1. Build: `npm run build -w @post-anki/extension`. This writes `apps/extension/dist`.
2. In Chrome, open `chrome://extensions`, turn on Developer mode, choose "Load unpacked", and pick `apps/extension/dist`.
3. Copy the extension ID shown on its card.
4. Add `EXTENSION_ID=<that id>` to `apps/api/.env.local` and restart the API.
5. Open the extension's options page. Leave the base URL as is unless the API runs elsewhere. Fill in the token only when the API sets `API_SHARED_SECRET`.

The manifest `key` fixes the extension id, so the id stays the same when `dist` moves. The id shown on the extension card is the value to set.

## Known limits

- The unit tests cover the CORS decision, the text builder, the settings, the send function, the pending-capture retry, the options form and the subject loader. `apps/extension/e2e/capture-e2e.mjs` (`npm run e2e -w @post-anki/extension`) loads the built extension in Chromium through Playwright and sends a real selection to a running API. It needs `EXT_TOKEN` and `DATABASE_URL` in the environment and a built `dist`.
- The 50,000-character cap is applied in the extension and enforced again by the API.
- Only the single-text branch of the API is used. A capture has a subject only when a default subject is saved in the options page.
- The toolbar button opens the review page when no capture is pending. There is no popup.

## Plan

`.planning/highlight-capture-extension/plan.md` records the MVP scope: reuse the existing endpoint and token path, add no table, and keep the extension free of a UI framework.
