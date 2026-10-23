# Plan report: macos-app

Plan: /Users/ikushlianski/webdata/ilya-projects/post-anki-ios/.planning/macos-app/plan.md (156 lines). Complexity: Complex. Plan only; nothing implemented, nothing committed.

## What the plan delivers

A native Mac app for the core study loop (courses, due-card review, pending-item review, add knowledge by typing or pasting, server and token settings), built in three steps that each leave both the iPhone and Mac apps building:
1. Move the whole API folder (client, models, token storage) into a local Swift package that both apps use. The iPhone app behaves exactly as before.
2. Add the Mac app: one window with a sidebar and a detail area. Review is keyboard-first: type an answer, press Return to see the real answer, press 1-4 to grade, and the next card appears.
3. Add Mac settings for the server address and token. The settings form is the same one the iPhone app uses, and the token goes in the Mac keychain.

## Architecture

- **Fact** (from reading the code): the API folder has 55 files and about 280 types. It depends on nothing else in the app. The app creates 18 of these model types directly, and about 43 of them are not marked `Sendable`.
- Decision: the package holds only the server data contract. Screens and view models that work on both platforms go into a shared source folder (`Sources/Shared/`) that both app targets compile. They are not in the package because they depend on app-wide objects (the pending count, the offline grade queue). Moving them would create a second large public interface for no benefit.
- Decision: the Mac app gets its own wrappers for courses, the review switcher and keyboard-first due review. The pending-items review, add-knowledge, settings and edit screens are shared, with small `#if os` checks for iPhone-only features. **Fact:** the iPhone courses and due-review screens pull in many features outside the core loop, which is why the Mac app wraps them instead.
- Decision: the Mac app opens a single window, so two windows can't grade the same card. The token goes in the regular login keychain, not the newer data-protection keychain, because the newer one needs a provisioning profile (Apple TN3137, below). The setting that controls when a token can be read applies only to that newer keychain, so it stays iPhone-only. Saved settings move into the app's sandbox automatically. No shared keychain group or App Group is needed.

## Code notes

- Once a type is public, Swift no longer treats it as `Sendable` automatically, and its automatic memberwise initializer stays internal. The plan therefore marks every model `Sendable` explicitly and writes public initializers only for the 18 types the app creates.
- The grade keys 1-4 only work after the answer is shown, and the answer field is disabled at that point, so the keys grade instead of typing digits. This still needs a hands-on check.

## Defaults logged instead of asked

- On the Mac, "Ingest" is the type-or-dictate add-knowledge screen. It is not the iPhone tab of the same name, which confirms question variants.
- The typed answer is only for comparing yourself. It is not sent to the server, because the review request has no field for it.
- Return after the answer is shown does nothing. Cmd-Return submits on the add-knowledge screen.
- Settings appears only in the sidebar. A Cmd-comma Settings window was left out of scope.
- Mac bundle ID `com.ikushlianski.postankimac`, minimum macOS 14, app sandbox plus outgoing network access only.
- Deviation from the skill: as the dispatcher asked, this run wrote a single plan.md, with no spec, scenarios or todo files, no grill round and no consistency gate.

## Risks

- **Fact:** many files are staged but not committed, including the API folder. The user should commit that baseline before Step 1.
- Step 1 is a large mechanical change. The XcodeGen syntax for local packages and entitlements must be checked against version 2.46.
- Builds signed with "Sign to Run Locally" may trigger keychain permission prompts. Setting a development team in `Local.xcconfig` avoids them.

Sources: [TN3137 On Mac keychains](https://developer.apple.com/documentation/technotes/tn3137-on-mac-keychains.md), [Troubleshooting -34018 Keychain Errors](https://developer.apple.com/forums/thread/114456), [-34018 from command line swift program](https://developer.apple.com/forums/thread/759481)

END-OF-REPORT
