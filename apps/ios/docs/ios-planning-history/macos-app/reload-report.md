# Reload and unreadable queue report

Diff: `git diff --cached -- Sources Tests` (after staging the files below).

- MacDueReviewView: toolbar Reload (MacReloadButton, Cmd-R), disabled while grading or loading.
- PendingReviewScreen (shared): macOS-only toolbar Reload with Cmd-R when `onDone == nil` (inlined button, since MacReloadButton lives in the Mac-only folder and is out of scope for the Shared target). Only one of the two screens is on screen at a time in MacReviewView, so no shortcut clash.
- MacReviewView needed no change: it hosts both screens, which now carry the button.
- PendingAnswerQueue.load: undecodable file is moved to `pending-answers.unreadable-<ts>.json`, mirroring PendingGradeQueue. iOS otherwise unchanged.
- Test: CrashGuardSmokeTests "should keep an unreadable pending-answers file on disk instead of overwriting it".

Checks: iOS scheme build succeeded; Mac scheme tests succeeded (private spec copy at /private/tmp/rl-spec, derived data /private/tmp/dd-rl). `npx tsc --noEmit`: no TypeScript in this Swift repo, not applicable; no lint or vitest configured.

Defaults: Reload on due review calls `model.load()` directly (does not flush the queue first).

END-OF-REPORT
