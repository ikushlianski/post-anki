# W4a report: Mac smoke tests

## Result
- New hostless macOS unit-test target `PostAnkiMacSmokeTests` in `project.yml` (sources: `Sources/Shared` plus `Tests/PostAnkiMacSmokeTests`, package fixture folder as resources, `PostAnkiAPI` dependency), added to the `PostAnkiMac` scheme test action, so Cmd-U runs it.
- Mac Info.plist now carries `PostAnkiDevAPIURL = $(POSTANKI_DEV_API_URL)` (verified in the built app: present, empty string with the empty default).
- 16 tests in one serialized root suite `SmokeTests`, all passing. Both app schemes BUILD SUCCEEDED (dd-4a).
- Run: `xcodebuild test -project PostAnkiIOS.xcodeproj -scheme PostAnkiMac -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO`.

## Coverage
- Home summary and streak; due counts total (21); pending review list.
- Courses, knowledge list, source library, tags with mastery, learning list, admin (settings, observability, feedback).
- 401 gives signed-out and a dropped connection gives offline (due counts, courses, learning list); admin 403 gives "other" with the server message, not signed out.

## Files
- `project.yml`, `Config/PostAnkiMac-Info.plist` (xcodegen-generated from the `info:` block)
- `Tests/PostAnkiMacSmokeTests/` : `FakeServer.swift`, `SmokeTests.swift`, three suite files, `Fixtures/*.json` (7 new)

## Defaults taken
- Info.plist key goes through an xcodegen `info:` block (generates `Config/PostAnkiMac-Info.plist`) because `INFOPLIST_KEY_` only emits Apple-known keys, so a custom key was silently dropped.
- Fake server sets UserDefaults `apiBaseURL` directly and restores the prior value, so it does not depend on 4b's setter API; saved address wins over the dev fallback, so tests are not affected by a Local.xcconfig dev URL.
- New fixtures (library sources, learning list, tags, tag mastery, admin x3) are hand-written to the package decoders' shapes, not copied from `../post-anki` server schemas; worth a later check against the server.
- One root `.serialized` suite with the three suites nested, since the fake server is process-global and separate suites would otherwise run in parallel.
- Package fixtures are referenced as a folder (`Fixtures/` subdirectory in the bundle); the new fixtures sit flat; the loader tries both.
- Home test uses `HomeSummaryModel` (the Shared home loader); `HomeScreenModel` needs stored last-course state and was left out.
- `PostAnkiIOS.xcodeproj` is gitignored, so not staged.

END-OF-REPORT
