# Implementation report: 01-token-bearer

## Files changed
- Sources/PostAnkiIOS/API/TokenStore.swift (new): Keychain read / save / clear, generic password item, `AfterFirstUnlockThisDeviceOnly`, not synchronizable, `TokenStoreError` holds only the OSStatus.
- Sources/PostAnkiIOS/API/APIClient.swift: `Authorization: Bearer` added in the single `request` builder (https or localhost/127.0.0.1 only), 401 throws new `APIError.unauthorized`, header comment replaced.
- Sources/PostAnkiIOS/PendingAnswerQueue.swift: `catch APIError.unauthorized { return }` keeps queued answers on 401.
- README.md: stale "No authentication" line replaced.

All four are staged (`git add`); nothing committed. Staging APIClient.swift also staged its earlier uncommitted edits in that file.

## git diff de63fb30cd9c057ace42e5a021c28653b2d87a89 --numstat -- Sources README.md
```
2	2	README.md
15	3	Sources/PostAnkiIOS/API/APIClient.swift
80	0	Sources/PostAnkiIOS/API/TokenStore.swift
2	0	Sources/PostAnkiIOS/PendingAnswerQueue.swift
```

## Build
- `xcodegen generate`: succeeded (PostAnkiIOS.xcodeproj is gitignored).
- `xcodebuild -project PostAnkiIOS.xcodeproj -scheme PostAnkiIOS -destination 'generic/platform=iOS Simulator' -quiet build CODE_SIGNING_ALLOWED=NO`: exit 0, no errors or warnings in output.
- Live behavior against the real API is NOT verified (prod API not deployed, no UI yet to store a token). Keychain read/save/clear were not exercised at runtime.

## Defaults taken
- Token characters allowed: printable ASCII 0x21-0x7E (no inner spaces), since the value goes into an HTTP header.
- `kSecAttrSynchronizable` false is set in the shared item query, so read/update/delete match only the local item.
- `canSendToken` is a private helper in `APIClient` (host match is exact `localhost` / `127.0.0.1`).
- No logging, no caching, no UserDefaults use for the token; no test target added (none exists).

END-OF-REPORT
