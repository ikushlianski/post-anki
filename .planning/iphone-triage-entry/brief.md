# iPhone triage entry screen: triage all or by subject, fewer buttons

User ask: "ability to triage by subject, or triage all. make it fewer buttons overall if possible, and only if required." Earlier: with many items the Triage all button was pushed off-screen; it must be at the very top.

## Today (iPhone, `apps/ios/Sources/Shared/PendingReviewScreen+content.swift`, `#if os(iOS)` branch)
- Top: Triage all button (just added), then attention notices, Chat queue link, Inbox link.
- No stored session: subject rows (`triage-subjects-section.swift`, tap = triage that subject).
- Stored session (`session.storedSession != nil`): a summary with a disabled subject picker (`pending-review-inbox-summary.swift`) and a bottom "Resume triage" bar (`pending-review-inbox-start-bar.swift`). The user cannot pick another subject or triage all here.
- Below everything: every source with every item row (approve/reject/edit each), per-source Regenerate row and "Approve all" footer. This is the long list that buries the choices.

## Target behaviour (iPhone only; Mac screen unchanged)
- One choice block at the very top of the screen:
  - If a session is in progress: a prominent "Resume triage" button (name the subject if scoped, e.g. "Resume triage · Spanish"), first.
  - "Triage all (N)": prominent when no session is in progress, plain (bordered) when Resume is shown.
  - Subject rows: tap one to triage just that subject. These stay available even while a session is in progress.
  - Starting Triage all or a subject while a session is stored starts a fresh session for that choice (the stored one is replaced). Find how `session.start()` / `FocusTriageSessionStore` resume today and add the minimal "discard stored, start new" path; never lose a decision that was already saved to the server.
- Remove the bottom Resume bar and the stored-session summary block (they are replaced by the top block).
- The per-item list (item rows, Regenerate rows, Approve all footers) moves behind one collapsed row at the bottom, "Show all items (N)", collapsed by default each time the screen opens. When expanded it behaves exactly as today. No functionality is removed.
- Chat queue link, Inbox link and attention notices stay, placed below the choice block.
- Empty, loading and error states keep working (subjects model `errorMessage` / `hasLoaded`, `session.error`).

## Constraints
- Stage only, never commit. Follow existing SwiftUI patterns, zoom fonts/padding helpers, kebab-case new files, files under ~300 lines (PendingReviewScreen+content.swift is ~260 already; extract the iOS list into a new file if it grows).
- Tests (Swift Testing, existing smoke tests under `apps/ios/Tests/`): cover the pure decisions (which primary button shows and its title with/without a stored session; starting a different choice while a session is stored starts fresh). Run only the touched test files, one xcodebuild at a time; `apps/ios/scripts/run-mac.sh --test` runs the Mac suites. Confirm the iOS app target compiles (e.g. `xcodebuild -scheme PostAnkiIOS -destination 'generic/platform=iOS' -derivedDataPath build build CODE_SIGNING_ALLOWED=NO`).
- Note: the Mac Release build is being built separately; do not touch `apps/ios/build` contents beyond normal derived data.
