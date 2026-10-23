# ex11 report

Diff: git diff --cached -- Sources/PostAnkiMac Tests/PostAnkiMacRegistryTests

- MacHistoryCenter.reset() clears every stack in place (path and forward), bumps revision; called from MacRootView settings-saved handler only when ServerScope.current differs from the last seen scope (token-only saves keep history).
- MacStackHistory.setPath clears forward in every branch except a pure pop-prefix.
- MacRefocusView.open uses a request token, also invalidated on disappear, so stale opens are dropped.
- Cmd-K: MacCommands sets a pending flag, opens window "main", posts the notification; MacRootView consumes the flag on appear if the window was closed.
- Tests added: equal-length, non-prefix shorter, reset.
- Builds: iOS and Mac schemes succeeded; Mac scheme tests succeeded (derived data /private/tmp/dd-h1, spec under /private/tmp/h1spec with symlinks).
- Default: no ESLint-style lint exists in repo; tsc/vitest not applicable (Swift).

END-OF-REPORT
