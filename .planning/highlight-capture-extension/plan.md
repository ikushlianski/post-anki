# Plan: highlight-capture extension (MVP)

## Goal
Right-click "Send to post-anki" on selected Chrome text posts it, with the page URL, to the local API as a knowledge source identical to a /add-knowledge paste, so the existing after-paste kick runs.

## Approach
- No new endpoint, table or pipeline. The extension calls the existing `POST /knowledge-sources` with `{ text }`; the page URL is appended to the text (`knowledge_sources` has no URL column; adding one needs a migration, out of MVP). The controller already trims, caps at 50,000 and calls `kickPipelineInBackground()`.
- New workspace `apps/extension` (MV3, plain TypeScript, no UI framework, no content script).
- Reuse from unmerged `chrome-extension-note-capture` (read-only; its `server.ts` is stale since `api-server.ts` replaced it, so nothing is cherry-picked): the `contextMenus` + `contexts: ["selection"]` idea, the `chrome.storage.local` settings pattern (token and base URL), and the single-origin `chrome-extension://<EXTENSION_ID>` CORS plus `EXTENSION_ID` env. Not reused: captures/hierarchy tables, `extension_tokens`, route allowlist, popup/React, hierarchy picker. Auth reuses the existing `api-token` bearer path in `authorized()`.
- API CORS (guarded): `api-server.ts` currently always sends `Access-Control-Allow-Origin: WEB_ORIGIN`. A pure helper picks from the allow-list `[WEB_ORIGIN, chrome-extension://EXTENSION_ID when set]`. A request whose `Origin` is in the list gets that origin echoed plus `Vary: Origin`. A request with an unlisted `Origin` gets 403 before auth. A request with no `Origin` (BFF, bot, mobile, curl) is unchanged. The 403 matters because CORS alone does not stop a web page firing a no-preflight `text/plain` POST at an open local API.
- Auth locally: `API_SHARED_SECRET` unset means open, so the token field is optional. If set, the user pastes an existing API token or the shared secret into the options page; it is sent as `Authorization: Bearer`.
- Untrusted text: sent as JSON data only and never rendered, evaluated or put in HTML by the extension. The URL is validated as http(s). Downstream detection already treats `rawText` as data; this plan does not touch the prompts.

## Steps
1. `apps/api/src/shared/cors.ts` + `cors.test.ts`: `resolveCorsDecision({ requestOrigin, webOrigin, extensionId })` returns `{ allowedOrigin } | { forbidden: true } | { noOrigin: true }`. Use `EXTENSION_ID`.
2. `apps/api/src/shared/env.ts`: add `EXTENSION_ID: z.string().min(1).optional()`. `apps/api/.env.example`: add a commented `EXTENSION_ID=` with a one-line note.
3. `apps/api/src/api-server.ts` (~line 327): replace the three static CORS `setHeader` calls with the helper. Keep Methods and Headers; send 403 JSON `{ error: "origin_not_allowed" }` for forbidden. Keep OPTIONS 204 only for allowed or no-Origin.
4. `apps/extension/package.json`: name `@post-anki/extension`, scripts `build` (`tsc -p tsconfig.build.json && cp -R public/. dist/`), `typecheck`, `test`. devDeps `@types/chrome`, `typescript ^5.7.0`, `vitest ^2.1.0`. Add `apps/extension` to root `package.json` workspaces and run `npm install` for the lockfile.
5. `apps/extension/tsconfig.json` (noEmit, includes tests, types chrome) and `tsconfig.build.json` (extends it, emits to `dist`, excludes `*.test.ts`). Imports use `.js` suffixes.
6. `apps/extension/public/manifest.json`: MV3, `permissions: ["contextMenus","storage"]`, no `host_permissions`, `background.service_worker: "background.js"` with `type: "module"`, `options_page: "options.html"`.
7. `apps/extension/src/capture/build-capture-text.ts` + test: input `{ selection, pageUrl }`. Trim the selection; empty returns `{ ok:false }`. Accept only `http:`/`https:` URLs and drop the `#fragment`. Output is `selection + "\n\nSource: " + url`, with the selection truncated so the total is at most 50,000 chars.
8. `apps/extension/src/settings/settings.ts` + test: `getSettings`/`saveSettings` on `chrome.storage.local` (a stubbed storage object in tests). Base URL defaults to `http://localhost:5560`, must be http(s), trailing slash stripped. Token is optional.
9. `apps/extension/src/capture/send-capture.ts` + test: `sendCapture(text, settings, fetchImpl)` POSTs JSON to `${baseUrl}/knowledge-sources`, adds the Bearer header only when a token is set, and returns `{ ok:true }` on 201 or `{ ok:false, reason }` for 400/401/403/network (never throws, never logs the text).
10. `apps/extension/src/background.ts`: on `onInstalled` create the menu "Send to post-anki" (`contexts:["selection"]`); on click build the text, send it, then `chrome.action.setBadgeText` "OK" or "ERR" and clear it after 4s. Use `info.selectionText` and `info.pageUrl ?? tab.url`.
11. `apps/extension/public/options.html` + `src/options.ts`: two inputs (base URL, optional token) and Save. Write values with `textContent`/`value` only.
12. `apps/extension/README.md` (under 30 lines): build, load unpacked, copy the extension ID into `apps/api/.env.local` as `EXTENSION_ID`, restart the API, optional token.
13. Run `npx tsc --noEmit` (api and extension), `npx vitest run` in each, `npm run depcruise`, and the project lint.

## Tests
- `cors.test.ts`: web origin echoed; extension origin echoed only when `EXTENSION_ID` matches exactly; `chrome-extension://other` and `https://evil.example` forbidden; no Origin passes; no wildcard is ever returned.
- `build-capture-text.test.ts`: URL appended; fragment dropped; `javascript:`/`file:` URLs rejected; blank selection rejected; a 60,000-char selection yields exactly 50,000 or fewer chars with the Source line intact.
- `send-capture.test.ts`: body is `{ text }` to `/knowledge-sources`; Bearer sent only with a token; 201 gives ok; 400/401/403 and network failure give `ok:false` without throwing.
- `settings.test.ts`: defaults, invalid URL rejected, trailing slash stripped.
- The existing `knowledge-source.controller*.test.ts` already covers the 50,000 cap and the post-response kick; do not duplicate it.

## Done when
- Selecting text and choosing "Send to post-anki" creates a `pending` prose knowledge source containing the text and `Source: <url>`, visible where /add-knowledge pastes land, and detection runs.
- A request from an unlisted browser origin gets 403, and the web app (`:5540`) still works.
- With `EXTENSION_ID` unset no extension origin is accepted; with it set only that exact origin is.
- The manifest holds only `contextMenus` and `storage`, with no host permissions and no content scripts.
- All new and existing tests, typecheck, lint and depcruise pass.

## Defaults chosen
- URL appended to text, not a new column: keeps the pipeline and schema untouched.
- Extension sends `{ text }` to the existing endpoint: "exactly like pasting" with zero endpoint drift.
- Plain TypeScript with a `tsc` build and no Vite or React: no UI to justify them, fewer dependencies.
- No `host_permissions`: CORS is the gate, so the extension origin must be allow-listed (least privilege).
- Existing `api-token`/shared secret, no `extension_tokens` table: the note-capture token system is out of MVP scope.
- Keyboard shortcut skipped: needs `scripting` plus `activeTab` permissions, and it is optional.
- Badge OK/ERR for feedback: avoids a `notifications` permission.
- URL fragment dropped, query kept: fragments are client-only noise; queries often identify the page.
- Selection truncated client-side to fit 50,000 with the URL line: avoids a 400 and keeps the source link.
- Global 403 for unlisted Origin: closes the no-preflight POST hole. Origin-less callers are unaffected.
- Dependency proposal: `@types/chrome` (devDependency, extension only), not yet in TECH-STACK-BY-PROJECT.md. `typescript` and `vitest` match the api versions. Confirm before `npm install`.

## Footprint
- `.planning/highlight-capture-extension/plan.md`
- `package.json` (workspaces), `package-lock.json`
- `apps/api/src/shared/cors.ts` (guarded: CORS)
- `apps/api/src/shared/cors.test.ts`
- `apps/api/src/shared/env.ts` (guarded: env)
- `apps/api/src/api-server.ts` (guarded: CORS and origin gate, before auth)
- `apps/api/.env.example` (guarded: env/secrets docs only, no values)
- `apps/extension/package.json`, `tsconfig.json`, `tsconfig.build.json`, `README.md`
- `apps/extension/public/manifest.json`, `apps/extension/public/options.html`
- `apps/extension/src/background.ts`, `src/options.ts`
- `apps/extension/src/capture/build-capture-text.ts` (+ `.test.ts`), `send-capture.ts` (+ `.test.ts`)
- `apps/extension/src/settings/settings.ts` (+ `.test.ts`)

END-OF-REPORT
