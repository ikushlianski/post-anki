# post-anki capture extension

Chrome (MV3) extension: select text on a page, right-click "Send to post-anki". The selection,
page URL and title are posted to `POST /knowledge-sources`, like a paste in /add-knowledge.

## Run steps

1. Add `EXTENSION_ID=phmjgadfbbagfjlfgcdloehdcoapiohf` to `apps/api/.env.local`. The manifest
   `key` pins this ID, and only `chrome-extension://<id>` is added to the API's CORS allow-list.
2. From the repo root, run `npm run dev` (API on 5560, web on 5540).
3. Mint a token with `DATABASE_URL` set to the dev database:
   `DATABASE_URL=<dev url> npx tsx apps/api/scripts/create-api-token.ts "chrome-extension"`.
   Copy the `pat_...` token it prints; it is shown once.
4. Run `npm run build -w @post-anki/extension`. Output goes to `apps/extension/dist`.
5. Open `chrome://extensions`, turn on Developer mode, choose "Load unpacked", pick
   `apps/extension/dist`. The card must show ID `phmjgadfbbagfjlfgcdloehdcoapiohf`.
6. Open the extension's options page: keep base URL `http://localhost:5560`, paste the token,
   optionally pick an exam subject, save.
7. On a docs page, select a paragraph, right-click, choose "Send to post-anki", and wait for
   the OK badge (it clears after 4 seconds).
8. Click the toolbar icon to open `/knowledge-bit-review` and approve the extracted cards.

A small toast in the bottom-right of the tab also reports the result for about 3 seconds
(saved, already added, no token, token rejected, server unreachable, rejected text). On pages
where scripts cannot be injected (chrome:// pages, the Web Store) only the badge is shown.

After code changes: run `npm run build -w @post-anki/extension`, open `chrome://extensions` and
press reload on the extension card, then refresh any tabs that were already open.

## Headless check

With the API running, a token minted (step 3) and the extension built (step 4), run from the repo root:
`set -a; . apps/api/.env.local; set +a; EXT_TOKEN=<pat_...> npm run e2e -w @post-anki/extension`.
It loads `dist` into headless Chromium (Playwright from the root `node_modules`), selects text on
https://playwright.dev/docs/intro, fires the context-menu handler from the service worker and
checks badges, toasts, the stored row and CORS. Needs `psql` on PATH. Verified with Playwright headless.

## Troubleshooting

Hover the toolbar icon while the ERR badge shows to read the message.

| Tooltip | Cause and fix |
| --- | --- |
| `Token rejected (401)` | Token missing, mistyped or not minted on this database. Mint a new one and save it in options. |
| `Extension not allowed (403): set EXTENSION_ID in the API env` | `EXTENSION_ID` is missing or differs from the loaded ID. Fix `apps/api/.env.local` and restart the API. |
| `API not reachable at <url>` | API is not running, or the base URL is wrong. Start `npm run dev` and check options. |
| `Rejected: text invalid or too long` | Selection is empty after trimming or over 50,000 characters. |
| `API error (<status>)` | Server-side failure; check the API logs. |
| `No text selected` | The menu was used without a selection. |
