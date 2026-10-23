# W4d report: manual test sequence

Diff: `git diff --cached -- .planning/macos-app/manual-test-sequence.md`

## Checks
Documentation only. No builds, tests or lint run.

## What changed
- `manual-test-sequence.md` rewritten: setup with repo-root `Local.xcconfig` copied from `Local.xcconfig.example`; launch-check states (no token, wrong token, server down, offline, dev address via `POSTANKI_DEV_API_URL`, Settings override, Use default, Release ignores dev key); shortcuts from `MacCommands.swift` and the registry; one section per sidebar section (Study, Library, Learn, Manage, Admin) listing all 27 entries; Settings, offline/signed-out, window restore and iOS regression sections.

## Defaults taken
- Launch-check steps use the exact banner and Settings texts from the 4b files (`MacLaunchCheck.swift`, `SettingsScreen.swift`, `Local.xcconfig.example`) as they are in the working tree; recheck if 4b changes them.
- Review keys 1-4 follow the existing doc (1 Again, 2 Hard, 3 Good, 4 Easy); Notes steps are generic since no report details them.
- Cmd-3 is Review and Cmd-4 Knowledge (per registry), replacing the old order in the document.

END-OF-REPORT
