# Step 2 report: macOS target

Diff command: `git diff --cached -M --stat` (all staged, nothing committed).

## Result
- New target `PostAnkiMac` (macOS 14, bundle id `com.ikushlianski.postankimac`, sandbox + network.client, entitlements file `Config/PostAnkiMac.entitlements` written by XcodeGen). Bundle id and iOS-only Info.plist keys moved from project-level settings into the iOS target.
- `Sources/Shared` (compiled by both targets): due-review model/queue, pending-review screens and models, edit/reject sheets, ingest screen, plus new `DueReviewGradeButtons`, `DueReviewStateViews`, `CoursesModels` split out of the iOS files. Platform guards: title display mode, top-bar leading item, drag indicator, UIKit/AppKit activation notification; Mac-only Cmd-Return submit, sheet minimum size, digit shortcuts 1-4 on grade buttons.
- `Sources/PostAnkiMac`: single `Window` scene, sidebar (Courses, Review with pending badge, Ingest), courses list + detail with per-topic "Add knowledge" and Cmd-R reload, Review with Due today / Pending items picker, keyboard-first due review (Return reveals, 1-4 grade, field refocused per card).
- README gained a "macOS app" section. Settings entry and Open Settings button not added (Step 3).

## Checks
- `xcodegen generate`: ok.
- iOS simulator build (CODE_SIGNING_ALLOWED=NO): BUILD SUCCEEDED.
- macOS build (`platform=macOS`, CODE_SIGNING_ALLOWED=NO): BUILD SUCCEEDED. Only warning: generic AppIntents metadata skip.
- Not run: signed build/codesign entitlement check and manual keyboard test (need a GUI session); tsc/eslint/vitest do not apply to this Swift repo.

## Defaults (one line each)
- Plan said Settings arrives in Step 3, so the sidebar has no Settings placeholder.
- Unauthorized due-review state uses the shared message view with "Try again" and text pointing to Settings (no button yet).
- Mac courses detail has no stats/edit/practice sections (iOS-only per plan); the iOS `CoursesScreen` is unchanged apart from the moved models.
- `.xcodeproj` is gitignored, so only sources, project.yml, entitlements and README are staged.

END-OF-REPORT
