import PostAnkiAPI

extension DueReviewModel {
    nonisolated static func isSettled(
        _ card: ReviewCard,
        settledVariantIds: Set<String>,
        settledBitIds: Set<String>
    ) -> Bool {
        guard !card.isRehearsal else { return false }

        if settledVariantIds.contains(card.variantId) { return true }

        return !card.isIndependentCard && settledBitIds.contains(card.knowledgeBitId)
    }

    func isSettled(_ card: ReviewCard) -> Bool {
        Self.isSettled(card, settledVariantIds: settledVariantIds, settledBitIds: settledBitIds)
    }
}
