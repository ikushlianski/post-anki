import PostAnkiAPI

extension DueReviewModel {
    @discardableResult
    func handleConfirmKey() -> Bool {
        guard current != nil, !isGrading else { return false }

        if isRevealed {
            Task { await grade(.good) }
        } else {
            reveal()
        }

        return true
    }
}
