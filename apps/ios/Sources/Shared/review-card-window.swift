import Foundation
import PostAnkiAPI

enum ReviewCardWindow {
    static let target = 20
    static let lowWater = 8
    static let topUpLimit = 50

    static func needsTopUp(remaining: Int, exhausted: Bool, inFlight: Bool) -> Bool {
        !exhausted && !inFlight && remaining < lowWater
    }

    static func merge(
        held: [ReviewCard],
        shown: ReviewCard?,
        incoming: [ReviewCard],
        isComplete: Bool,
        buriesSiblings: Bool,
        isBlocked: (ReviewCard) -> Bool
    ) -> [ReviewCard] {
        let incomingIds = Set(incoming.map(\.variantId))
        let kept = isComplete ? held.filter { $0.isRehearsal || incomingIds.contains($0.variantId) } : held
        var seenVariants = Set(kept.map(\.variantId))
        var seenBits = Set(kept.map(\.knowledgeBitId))

        if let shown {
            seenVariants.insert(shown.variantId)
            seenBits.insert(shown.knowledgeBitId)
        }

        var added: [ReviewCard] = []

        for card in incoming where !isBlocked(card) {
            guard !seenVariants.contains(card.variantId) else { continue }
            guard !(buriesSiblings || !card.isIndependentCard) || !seenBits.contains(card.knowledgeBitId) else {
                continue
            }

            seenVariants.insert(card.variantId)
            seenBits.insert(card.knowledgeBitId)
            added.append(card)
        }

        return kept + added
    }
}
