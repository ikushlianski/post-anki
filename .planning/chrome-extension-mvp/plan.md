# Chrome extension MVP: highlight to PostAnki

## The ask
- Select text on any page, send it to the local PostAnki in one action, so cards come out of the existing extraction and approval flow. Used for Claude certification exam prep, loaded unpacked, local only.

## What exists today (verified 2026-10-20)
- **Fact**: `apps/extension` is a workspace built with plain `tsc` plus a copy of `public/`, with no bundler. It has 17 passing vitest tests and a clean `tsc --noEmit`.
- **Fact**: `apps/extension/src/background.ts` adds a right-click menu item, "Send to post-anki", on selected text. It shows an OK or ERR badge for 4 seconds.
- **Fact**: `apps/extension/src/capture/build-capture-text.ts` trims the selection, caps it at 50,000 characters, and adds a `Source: <url>` line to the text itself.
- **Fact**: `apps/extension/src/capture/send-capture.ts` posts `{ text }` to `POST /knowledge-sources` with an optional Bearer token. `src/settings/settings.ts` keeps the base URL (default `http://localhost:5560`) and the token in `chrome.storage.local`.
- **Fact**: the manifest asks only for `contextMenus` and `storage`. It has no `key`, no `host_permissions` and no `activeTab`. The pinned key that gives ID `phmjgadfbbagfjlfgcdloehdcoapiohf` exists only on branch `chrome-extension-note-capture`.
- **Fact**: the todo item is ticked but only partly done.
  - The page URL goes into the text, not into `source_url`. The text path in `apps/api/src/knowledge-source/knowledge-source.controller.ts` calls `insertKnowledgeSource` with no URL, so the extracted cards get no source link.
  - `EXTENSION_ID` is missing from `apps/api/.env.local`.
- **Fact**: the API turns away any request whose browser origin is not on its allow-list, with a 403, before it checks the token. This is in `apps/api/src/api-server.ts` and `apps/api/src/shared/cors.ts`. `chrome-extension://<EXTENSION_ID>` is allowed only when that variable is set.
- **Fact**: login works one of two ways (`api-server.ts`, `authorized()`):
  - the `API_SHARED_SECRET` Bearer, which is set in `apps/api/.env`, so login is enforced locally;
  - a revocable personal token minted by `apps/api/scripts/create-api-token.ts`. These tokens have no scopes and give full access.
- **Fact**: ports are API 5560 and web 5540 (`~/.claude/devports/registry.toml`, `[projects.post-anki]`). The approval screen is `http://localhost:5540/knowledge-bit-review`.
- **Fact**: branch `chrome-extension-note-capture` has not been merged. It holds a Vite and React popup, a hierarchy picker and a token schema, and differs from this branch by about 15,000 lines over 120 files, most of it unrelated (tree-growth). **Decision**: don't reuse or merge it. Copy only its manifest `key`.

## MVP behaviour
- **Trigger (recommended, the only method)**: select text, right-click, choose "Send to PostAnki". Clicking the menu item also grants `activeTab`, which gives access to the tab title.
- **Data flow**: the service worker builds `{ text, sourceUrl, title, subjectId? }` and posts it to `POST /knowledge-sources` with the Bearer token. The API stores a prose source with `source_url` set, and the existing background run extracts the cards.
- **Outcome**: pending cards appear on `/knowledge-bit-review`, each carrying the page link through `source_links`. The user approves or edits them there, exactly as for a pasted text.
- **Feedback**: the badge shows `...` while sending, then `OK` or `ERR`. The icon tooltip gives the reason in plain words, for example "Saved", "API not reachable at <url>", "Token rejected (401)" or "Extension not allowed (403): set EXTENSION_ID". Clicking the toolbar icon opens the approval screen.
- **API down**: the badge shows ERR and the tooltip says "API not reachable". There's no queue and no retry. The text is still selected on the page, so the user starts the API and sends again.

## Architecture
- **Extension pieces**:
  - the existing service worker (menu, send, badge);
  - the existing options page (base URL, token), plus an optional default subject;
  - the pure helpers: building the request body, mapping status codes to messages, settings.
- **Build**: keep the plain `tsc` setup. There's no UI framework to bundle, so Vite or WXT would add tooling with no MVP gain.
- **API contract**: `POST /knowledge-sources`. Body: `text` (required, at most 50,000 characters), `sourceUrl?` (http or https, at most 2,048 characters), `title?` (at most 300 characters), `subjectId?`. The reply is 201 with the source row.
- **API change (no migration)**:
  - The single-text input accepts two new optional fields, `sourceUrl` and `title`.
  - `sourceUrl` is passed to `insertKnowledgeSource` when `isSafeSourceUrl` allows it, and stored as null otherwise, never rejected with a 400.
  - The field must not be called `url`: the controller sends any body that contains `url` down the fetch-the-page import path.
- **Title**: there is no column for it. The API adds it as a first line of the stored text (`Page: <title>`), so the extraction step has context and no migration is needed.
- **Auth**: a personal token labelled `chrome-extension`, minted once with `create-api-token.ts` and pasted into the options page. It can be revoked, and its last use is recorded. Don't paste the shared secret.
- **CORS**: set `EXTENSION_ID=phmjgadfbbagfjlfgcdloehdcoapiohf` in `apps/api/.env.local` (gitignored). The manifest `key` keeps that ID fixed.
- **Manifest permissions**:
  - `contextMenus`: the right-click item.
  - `storage`: base URL, token and subject in `chrome.storage.local`.
  - `activeTab`: the tab title after a menu click, with no access to all sites.
  - `host_permissions: ["http://localhost:5560/*", "http://127.0.0.1:5560/*"]`: lets the service worker call the local API, and nothing else.
  - No `scripting`, `tabs`, `notifications` or `<all_urls>`.

## Security
- Page text and titles are untrusted. They only enter the existing extraction step, which already defends against prompt injection (commit 6fc3544). Nothing from the page is ever run or shown as HTML in the extension.
- Size limits are checked on both sides: text 50,000, title 300, URL 2,048. The API enforces them with Zod, and URLs pass through `isSafeSourceUrl`.
- The token sits in `chrome.storage.local`, which is not encrypted, is local to this browser and is never synced.
  - **Accepted risk**: the token has full access and works on localhost only, and the user can revoke it.
  - `storage.session` would mean pasting the token again after every browser restart, so it was rejected.
- Nothing secret goes into the repo. The manifest `key` is a public key and is safe to commit. The token and `EXTENSION_ID` live only in the browser and in `.env.local`.

## Build units (in order)
1. **The API stores the page URL and title for a text capture.**
   - Done when: controller tests show `{text, sourceUrl, title}` storing `source_url` and the `Page:` line; an unsafe URL is stored as null; the existing paste and URL-import tests still pass.
2. **The extension sends `sourceUrl`, `title` and `subjectId` instead of a `Source:` line, and its manifest gains `key`, `activeTab` and `host_permissions`.**
   - Done when: the helper tests check the request body; vitest and tsc pass; Chrome shows ID `phmj...` after loading.
3. **Plain-words feedback: a sending badge, a reason in the tooltip, and a toolbar click that opens `/knowledge-bit-review`.**
   - Done when: a unit test covers the status-to-message mapping for 201, 400, 401, 403 and a network error.
4. **The options page has an optional default subject, a dropdown filled from `GET /subjects`.**
   - Done when: a saved subject is sent as `subjectId`, an empty choice leaves it out, and an API outage leaves the field empty instead of breaking the page.
5. **The README covers the run steps and a real capture has been checked.**
   - Done when: text captured from a real docs page produces pending cards on `/knowledge-bit-review` that link back to that page.

## Manual run steps
1. Add `EXTENSION_ID=phmjgadfbbagfjlfgcdloehdcoapiohf` to `apps/api/.env.local`, then run `npm run dev` from the repo root (API on 5560, web on 5540).
2. Run `npx tsx apps/api/scripts/create-api-token.ts "chrome-extension"` with `DATABASE_URL` set, and copy the token it prints.
3. Run `npm run build -w @post-anki/extension`. Then open `chrome://extensions`, turn on Developer mode, choose "Load unpacked", pick `apps/extension/dist`, and check the ID.
4. Open the extension's options page, keep the base URL `http://localhost:5560`, paste the token, optionally pick the exam subject, and save.
5. On a real docs page, select a paragraph, right-click, choose "Send to PostAnki", and wait for the OK badge. Click the icon, then approve the cards on `/knowledge-bit-review`.

## Not in MVP
- Keyboard shortcut, floating button, popup form, or editing the text before sending.
- Filing into the curriculum hierarchy, enrichment, extracting tables, an offline queue or retries.
- Scoped tokens (they need a migration), other browsers, store packaging, sync, or the production API.
- Vite, WXT, React, or merging `chrome-extension-note-capture`.

## Open decisions (recommended default)
- **Keyboard shortcut**: no. It would need `scripting` plus code that reads the selection. Add it later if the right-click proves slow.
- **Title storage**: add it as a first line of the text, with no migration. A dedicated column can come later if the approval screen needs it.
- **Selection newlines**: **Assumption**, to verify in unit 5: `selectionText` may squash line breaks. If extraction quality drops, read the selection with `activeTab` plus `scripting`.
- **Default subject**: include it, as unit 4. If time is tight, drop it and leave captures without a subject.
- **Token scope**: accept a full-access personal token for local use. Revisit if the extension ever points at production.

## Sources
- https://developer.chrome.com/docs/extensions/reference/api/contextMenus
- https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
- https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://developer.chrome.com/docs/extensions/reference/api/action
- https://developer.chrome.com/docs/extensions/reference/manifest/key
END-OF-REPORT
