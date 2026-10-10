# post-anki capture extension

Chrome (MV3) extension: select text, right-click "Send to post-anki". The text plus a
`Source: <url>` line is posted to `POST /knowledge-sources`, like a paste in /add-knowledge.

## Build and load

1. `npm run build -w @post-anki/extension` (outputs `apps/extension/dist`).
2. Open `chrome://extensions`, enable Developer mode, "Load unpacked", pick `apps/extension/dist`.
3. Copy the extension ID shown on the card.

## Allow the extension in the API

Add `EXTENSION_ID=<the id>` to `apps/api/.env.local` and restart the API. Only that exact
`chrome-extension://<id>` origin is accepted.

## Settings

Open the extension's options page. Base URL defaults to `http://localhost:5560`. The token is
needed only when the API has `API_SHARED_SECRET` set; paste an API token or the shared secret.

The toolbar badge shows OK or ERR for 4 seconds after each send.
