# Wave 1d: API package tests

Diff: `git diff --cached -- Packages/PostAnkiAPI README.md`

Checks: `swift test --package-path Packages/PostAnkiAPI --scratch-path /tmp/pkg-tests-build` passes (34 tests, 5 suites). `npx tsc`, lint and vitest do not apply (Swift-only repo, no package.json); app schemes were not built (no Sources/ change).

## What was added
- `Package.swift`: test target `PostAnkiAPITests`, fixtures as `.process("Fixtures")` resources.
- 21 JSON fixtures shaped from `post-anki/packages/shared/src` schemas (review cards, review-card empty/nullable case, record review, pending review sources/count/bulk approval, knowledge overview, subjects, curricula, curriculum detail, home summary, streak, weekly digest, quiet-week digest, retention report (full/empty), milestones, curriculum stats, error bodies).
- Suites: Review cards, Pending review, Courses and knowledge, Progress and home, Error handling (`ProgressLoadError.from` for offline / 401 / 404 / cancellation, error-body decode, `EmptyResponse`, pending-decision outcome mapping).
- `README.md`: one line on `swift test`.

## Defaults taken
- Fixtures include extra server-only fields on some responses to prove the decoder ignores them.
- Pending-review fixture has optional fields (sourceUrl, feedback) present in one source and absent in another, per the server interface.
- The only hand-written `init(from:)` reached by these responses is `EmptyResponse`; the Admin ones are not reached by main app screens and were left uncovered.
- Used `@testable import` to reach the internal `APIErrorBody`.
- Weekly-digest avgHours set to 5.3 so `hoursText` ("%.1f h") is stable under rounding.
- Staged only my files; sibling-staged files in the index belong to other agents.

END-OF-REPORT
