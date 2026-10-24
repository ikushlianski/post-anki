import PostAnkiAPI

struct ReviewRemainingCounts: Equatable, Sendable {
    let new: Int
    let learning: Int
    let review: Int

    init(new: Int, learning: Int, review: Int) {
        self.new = new
        self.learning = learning
        self.review = review
    }

    init(_ counts: ReviewCounts) {
        self.init(new: counts.new, learning: counts.learning, review: counts.review)
    }

    func lowered(gradedNew: Int, gradedOther: Int) -> ReviewRemainingCounts {
        ReviewRemainingCounts(
            new: max(0, new - gradedNew),
            learning: learning,
            review: max(0, review - gradedOther)
        )
    }

    static let legend = "New: never studied. Learning: still being learned today. Due: scheduled for today or earlier."
}
