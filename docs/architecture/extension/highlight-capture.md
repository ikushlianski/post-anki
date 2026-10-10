---
type: architecture
domain: extension
component: highlight-capture
state: as-built
updated: 2026-10-11
---
# Highlight capture (Chrome extension)

## What it does

A learner selects text on any web page, right-clicks, and chooses "Send to post-anki". The extension posts the selected text, followed by a `Source: <page url>` line, to the local API. The API stores it as a pending knowledge source, the same kind that a paste in the add-knowledge page creates, and starts the detection pipeline. The extension then shows OK or ERR on its toolbar badge for 4 seconds.

The extension sends no subject, so these sources have no subject.

## Parts

All under `apps/extension/`. It is a plain TypeScript Manifest V3 package with no UI framework and no content script.

- `public/manifest.json`: permissions are `contextMenus` and `storage` only. There are no `host_permissions`, so the extension cannot read pages. It runs `background.js` as a module service worker and declares the options page.
- `src/background.ts`: creates the context menu item on install, limited to selections. On click it builds the text, sends it, and sets the badge.
- `src/capture/build-capture-text.ts`: trims the selection (blank gives `empty_selection`). It accepts only `http:` and `https:` page urls (others give `invalid_url`), removes the `#fragment`, and appends `\n\nSource: <url>`. The total is capped at 50,000 characters by trimming the selection, so the source line stays intact.
- `src/capture/send-capture.ts`: `POST <baseUrl>/knowledge-sources` with body `{ "text": ... }` and `Content-Type: application/json`. It adds `Authorization: Bearer` only when a token is saved. A 201 gives `ok`. A 400, 401 or 403 gives a matching reason. Any other status or a network error gives `unexpected` or `network`. The function never throws and never logs the text.
- `src/settings/settings.ts`: stores `{ baseUrl, token }` under the `settings` key in `chrome.storage.local`. The base URL defaults to `http://localhost:5560`, must be http or https, and loses trailing slashes. The token is optional.
- `public/options.html` and `src/options.ts`: two fields (base URL, optional token) and a Save button. Saved values are written through the settings module, and the status line reports success or an invalid URL.

## API side

- `POST /knowledge-sources` is in `apps/api/src/router-table.ts`. The single-text branch of `apps/api/src/knowledge-source/knowledge-source.controller.ts` trims the text, rejects empty text, rejects text over 50,000 characters, inserts the source, and then starts the pipeline in the background after the response is sent.
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

The ID is a property of the installed copy. The manifest has no `key` field. Assumption: Chrome derives the ID for an unpacked extension from its folder path, so moving `dist` gives a new ID, and the API then rejects the extension until `EXTENSION_ID` is updated. To verify in `chrome://extensions`.

## Known limits

- Not verified in a browser. The unit tests cover the CORS decision, the text builder, the settings and the send function. No test here loads the extension in Chrome, sends a real selection, or confirms that a service-worker `fetch` reaches the API with the expected `Origin`.
- The source URL is stored as text inside the source, because `knowledge_sources` has no URL column.
- The 50,000-character cap is applied in the extension and enforced again by the API.
- Only the single-text branch of the API is used. Captures are never sorted into a subject.
- `apps/extension/dist` is not built in this repo state.

## Plan

`.planning/highlight-capture-extension/plan.md` records the MVP scope: reuse the existing endpoint and token path, add no table, and keep the extension free of a UI framework and of host permissions.
