## Decisions to make
Nothing to decide.

## To review / clarify
Nothing to review.
- Settings screen Low notes: spaces-only token clears saved token; address may hold plaintext password; Remove token lacks confirmation.
- Offline cache fixes: last small fix pass was not re-reviewed; test with airplane mode on a device.

## Coding tasks
- [x] Keep an access token in secure storage and send it as a bearer header on every request.
- [x] Add a settings screen from Home to edit the API server address and access token.
- [x] Fix the offline question cache: no reload after returning from chat, ignore cancelled requests, ignore double tap.

## Resolved
