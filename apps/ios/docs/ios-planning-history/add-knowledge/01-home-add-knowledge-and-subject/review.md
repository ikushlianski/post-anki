# Review: items 1-2 (Opus orchestrator)

Verdict: APPROVED

Checked: diff of Models.swift, APIClient.swift, CoursesScreen.swift, HomeScreen.swift against base b6eea2e, plus IngestionDictationScreen.swift whole. Matches plan. Server contract: `singleTextInput` subjectId optional/nullable min(1) (post-anki apps/api/src/knowledge-source/knowledge-source.controller.ts:20-26); synthesized Encodable omits nil, and CoursesScreen always passes a real curriculum subjectId, so "" is never sent. Home edit is a surgical insert; the DueToday lines in HomeScreen.swift belong to the scheduled-review orchestrator and were not touched. No force unwraps, @MainActor model, no token logging. Build exit 0 (own derived data).

## Findings
- Low: Submit stays disabled until the best-effort detect-bits call returns. Mechanism: `isSubmitting = false` runs after `try? await detectKnowledgeBits()`. Fix: reset isSubmitting before the detect call or fire it in a detached Task. Not fixed (cosmetic; confirmation alert already shows).
- Low: a stale subject (400 subject_not_found) shows the generic "try again" message. Mechanism: all errors map to one string. Fix: map that error to "This course no longer exists". Not fixed (rare).

END-OF-REPORT
