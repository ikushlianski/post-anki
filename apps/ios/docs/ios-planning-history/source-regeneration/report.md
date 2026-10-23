# Source regeneration and more variants: report

## What the learner can now do
- Review tab: each source has Regenerate items (asks first), then shows progress and reloads the list when done.
- Item detail: Generate more question variants.

## Files (Sources/PostAnkiIOS/)
- New: API/SourceRegenModels.swift, API/APIClient+SourceRegen.swift, SourceRegenModel.swift, SourceRegenerationRow.swift, MoreVariantsSection.swift
- Edited: PendingReviewScreen.swift (one line after the bits list), KnowledgeItemDetailScreen.swift (one line, last section)

## Build
xcodegen generate then xcodebuild (simulator, unsigned): BUILD SUCCEEDED.

## Defaults taken
- The row takes an extra pendingCount argument (default 0) so the confirm can name the item count; the plan's one-line call passes source.bits.count.
- Polling every 3 seconds, stops after 100 polls (5 minutes).

## Left undone
- Not run against the live API; build only.

END-OF-REPORT
