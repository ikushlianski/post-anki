# W4c report: README and run script

Files (staged): README.md, scripts/run-mac.sh (executable).

- README: the "macOS app" section is now "Develop the Mac app": prerequisites, set-up steps (Local.xcconfig, DEVELOPMENT_TEAM, POSTANKI_DEV_API_URL, xcodegen generate, scheme PostAnkiMac, Run / Cmd-U), run script usage, token entry in Settings, sidebar map, shortcuts, command-line build, package tests.
- Sidebar map and shortcuts were read from Sources/PostAnkiMac/Features/*.swift and MacCommands.swift (5 sections, 30 entries; Cmd-1..6, Cmd-Shift-L Learning list, Cmd-Shift-F Search).
- Script: xcodegen check and generate, Debug build with -derivedDataPath build, opens build/Build/Products/Debug/PostAnkiMac.app; `--test` runs `xcodebuild test` on scheme PostAnkiMac, then `swift test --package-path Packages/PostAnkiAPI`.
- build/ was already in .gitignore; unchanged.
- Checks: `bash -n scripts/run-mac.sh` passes. No build, tsc, lint or vitest run (Swift repo; siblings are editing files).

Defaults:
- The README describes sibling 4a (smoke tests, Cmd-U), 4b (POSTANKI_DEV_API_URL, Settings precedence, launch banner) as the plan specifies; they are not verified against the code.
- The example dev URL `http://localhost:3000` is a placeholder; the real port was not checked.
- App path assumes the default product name (no PRODUCT_NAME set in project.yml or Config).
- A first attempt to write files through a shell heredoc was blocked by a hook; files were written with the Write tool instead.

END-OF-REPORT
