# Fast feedback loops for the native Swift apps

state: draft

## Facts
- InjectionIII recompiles an edited file into a dynamic library and loads it into the running app, no restart (https://apps.apple.com/app/injectioniii/id1380446739).
- InjectionNext is a newer refresh of it, listed for macOS apps, simulator and device; needs `-Xlinker -interposable` in Debug Other Linker Flags (https://github.com/johnno1962/InjectionNext).
- Injection does not work with COMPILATION_CACHE_ENABLE_CACHING; Xcode 16.3+ log-parsing mode needs EMIT_FRONTEND_COMMAND_LINES (same README).
- Previews are good for isolated components, unreliable for whole screens in large apps; Apple's advice is small modules with UI as leaf nodes (https://developer.apple.com/forums/thread/740200).
- Per-module packages allow per-module tests that fail fast (https://dev.co/swift-package-manager-best-practices-for-modular-ios-architecture).
- XcodeBuildMCP exposes swift build and swift test with filters for agents (https://glama.ai/mcp/servers/getsentry/XcodeBuildMCP/tools/swift_package_test).

## Assumptions
- Our repo already follows the modular pattern: logic in `Packages/PostAnkiAPI` and `Sources/Shared`, tested without the app host.
- Sandbox-off Debug entitlements are needed for injection on the Mac; not confirmed by the READMEs.

## Loop ranking for this repo
1. Pure logic and models: `swift test --package-path Packages/PostAnkiAPI` and the host-less Mac smoke bundle (seconds, no windows).
2. Layout and styling: InjectionIII hot reload in the running Debug Mac app (about 1 s per save). Installed.
3. Single components: `#Preview` blocks with fixture data, only worth it for leaf views.
4. Full app build: `xcodebuild build` only when project structure changes.

## Open questions
- Does InjectionIII work on the sandbox-off Debug Mac build here? Untested.
- Move to InjectionNext if reloads prove slow or flaky.

END-OF-REPORT
