# ex4 report: registry tests and README

## Result
- Registry not compilable into the smoke bundle (its detail closures build the Mac views), so a new hosted test target `PostAnkiMacRegistryTests` (TEST_HOST = PostAnkiMac app, `@testable import PostAnkiMac`) is added to `project.yml` and to the PostAnkiMac scheme test action; Cmd-U runs it.
- 6 Swift Testing tests in `Tests/PostAnkiMacRegistryTests/MacFeatureRegistryTests.swift`: validator clean, unique ids, unique shortcuts, no reserved shortcut (includes ex2's Cmd-K), no empty group, home fallback.
- README: new section "Run post-anki locally and point the Mac app at it" (verified from ../post-anki `package.json`, `scripts/dev.sh`, `docker-compose.yml`, `apps/api/src/shared/env.ts`, `create-api-token.ts`); shortcut table updated from ex2-report (Cmd-K, Help > Keyboard Shortcuts).
- Builds: PostAnkiMac test run TEST SUCCEEDED (106 smoke tests + 6 registry tests); PostAnkiIOS simulator BUILD SUCCEEDED; derived data /private/tmp/dd-e4. xcodegen ran once.
- Diff: git diff --cached -- project.yml README.md Local.xcconfig.example Tests/PostAnkiMacRegistryTests

## Defaults
- Fixed the wrong example port: `Local.xcconfig.example` and the README said localhost:3000; the API default is 5560 (env.ts, apps/api/.env.example), so both now say 5560.
- "Empty groups" = a MacFeatureSection with no features.
- Token minting: no npm script exists; the README marks the exact command line as unverified (script usage text says `tsx scripts/create-api-token.ts <label>`, needs DATABASE_URL).
- Unverified, flagged in README: whether the API boots without other env values (e.g. OPENROUTER_API_KEY).
- Hosted tests launch the Mac app during Cmd-U.
- Lint/tsc/vitest not applicable (Swift repo).

END-OF-REPORT
