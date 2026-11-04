---
type: todo
branch: chrome-extension-note-capture
task: Chrome extension for quick note/link capture into post-anki's hierarchy
state: open
updated: 2026-08-09
---

# Todo: Chrome extension note capture

## Decisions to make
Nothing to decide — all decisions made during planning.

## To review / clarify
- Decide whether accepting or rejecting AI-suggested items needs one shared control or separate buttons per item.

## Manual steps
- Seed the production database with initial content once a human has database access.
- Register the extension's identity with the backend after it is first installed in Chrome.
- Generate an access token from admin settings and enter it into the extension before first use.

## Post-deploy checks
- Confirm ordinary websites cannot reach the backend; only the extension itself is allowed.
- Confirm a revoked access token is blocked immediately, not just after further use.

## Coding tasks
- [x] Make the extension always send to the production API address, ignoring any previously saved local address, with the field shown read-only.
- [x] Let the extension add a new subject or sub-subject from its popup, sending it to the same account the capture token belongs to.

