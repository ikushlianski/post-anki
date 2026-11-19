import PostAnkiAPI

enum ReviewQueueShuffle {
    static func shuffled(_ cards: [ReviewCard]) -> [ReviewCard] {
        guard cards.count > 1 else { return cards }

        var result = cards

        repeat { result.shuffle() } while result.map(\.variantId) == cards.map(\.variantId)

        return result
    }
}
