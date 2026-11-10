import Foundation
import PostAnkiAPI

extension DueReviewModel {
    static let packFinishedMessage = "Saved cards finished. Grades sync when you're back online."

    var isPackFinished: Bool { isServingPack && current == nil }

    var packCaption: String? {
        guard isServingPack, let packGeneratedAt else { return nil }

        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full

        return "Offline: using cards saved \(formatter.localizedString(for: packGeneratedAt, relativeTo: Date()))"
    }

    private var packScope: ReviewPackScope? {
        guard aheadDays == 0, scope == nil else { return nil }

        return .all
    }

    func loadFromPack() async -> Bool {
        guard let packScope, let offline = await reviewPack.cards(scope: packScope) else { return false }

        let cards = await visibleCards(
            offline.cards,
            extraBitIds: offline.gradedBitIds,
            extraVariantIds: offline.gradedVariantIds
        )

        isOffline = false
        isServingPack = true
        packGeneratedAt = offline.generatedAt
        windowExhausted = true
        serverCounts = ReviewRemainingCounts(ReviewPackStore.counts(of: cards))
        gradedNewCount = 0
        gradedOtherCount = 0
        nextDueAt = nil
        dailyLimit = nil
        noCardsYet = false
        pendingCount = await gradeQueue.count()
        queue = cards

        guard !queue.isEmpty else {
            current = nil
            state = .empty

            return true
        }

        present(queue.removeFirst())

        return true
    }
}
