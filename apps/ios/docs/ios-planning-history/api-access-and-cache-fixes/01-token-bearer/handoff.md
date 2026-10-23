# Handoff: 01-token-bearer

Complexity: Simple (plan-ie Simple path, with the Phase 3 resilience and security pass folded into spec.md). No interview, scenarios, architecture or todo files, no branch lookup, no scenario-gate tooling.

## Plan files
- /Users/ikushlianski/webdata/ilya-projects/post-anki-ios/.planning/api-access-and-cache-fixes/01-token-bearer/spec.md (state: confirmed)
- /Users/ikushlianski/webdata/ilya-projects/post-anki-ios/.planning/api-access-and-cache-fixes/01-token-bearer/handoff.md

## Files the implementer will touch
- /Users/ikushlianski/webdata/ilya-projects/post-anki-ios/Sources/PostAnkiIOS/API/TokenStore.swift (new)
- /Users/ikushlianski/webdata/ilya-projects/post-anki-ios/Sources/PostAnkiIOS/API/APIClient.swift
- /Users/ikushlianski/webdata/ilya-projects/post-anki-ios/Sources/PostAnkiIOS/PendingAnswerQueue.swift (the brief expected no change; see Findings)
- /Users/ikushlianski/webdata/ilya-projects/post-anki-ios/README.md (one stale line)
- Run `xcodegen generate` first because of the new file. `project.yml` needs no edit.

## Findings
- PendingAnswerQueue does need a change. Its final bare `catch` deletes the answer on any non-5xx, non-network error, so a 401 (missing, wrong or revoked token) would silently destroy the user's queued answers. Fix: `catch APIError.unauthorized { return }`.
- Server facts confirmed at post-anki `apps/api/src/api-server.ts:313-345` and `:406-408`: Bearer shared secret or personal access token; rejection is 401 `{"error":"unauthorized"}`; no secret configured means all requests pass.

## Blocking open questions
None.

## Defaults taken
- Keychain item: generic password, service `com.ikushlianski.postankiios.api`, account `access-token`, `AfterFirstUnlockThisDeviceOnly`, not synchronizable, no biometrics.
- Fail closed: any Keychain read error returns nil, so no header is sent and nothing crashes. Save and clear throw an error holding only the OSStatus. No logging of any kind. No token caching.
- Save trims the token, treats empty as clear, and rejects non-printable-ASCII (header safety).
- 401 becomes a new `APIError.unauthorized`. No UI change in this item.
- Header is attached only for https URLs or localhost/127.0.0.1 loopback.
- Queue change made (3 code files instead of the expected 2), plus a README line fix.
- No test target added. Verification is the xcodebuild plus diff review. Live data is not verifiable.

END-OF-REPORT
