import Foundation

public struct DuplicateSimilarCards: Sendable, Equatable {
    public static let maxCards = 5

    public let cards: [PendingReviewDuplicateOf.SimilarCard]
    public let failedCount: Int

    public static func ids(for duplicate: PendingReviewDuplicateOf) -> [String] {
        var seen = Set<String>()

        return ([duplicate.bitId] + duplicate.similarBitIds).filter { seen.insert($0).inserted }.prefix(maxCards).map { $0 }
    }

    public static func fallback(for duplicate: PendingReviewDuplicateOf) -> DuplicateSimilarCards {
        DuplicateSimilarCards(cards: [duplicate.similarCard], failedCount: 0)
    }

    public static func load(
        for duplicate: PendingReviewDuplicateOf,
        fetch: @escaping @Sendable (String) async throws -> SimilarCardDetail = { try await APIClient.similarCardDetail(id: $0) }
    ) async -> DuplicateSimilarCards {
        let ids = ids(for: duplicate)

        let fetched = await withTaskGroup(of: (Int, PendingReviewDuplicateOf.SimilarCard?).self) { group in
            for (index, id) in ids.enumerated() {
                group.addTask { (index, try? await fetch(id).card) }
            }

            var slots = [PendingReviewDuplicateOf.SimilarCard?](repeating: nil, count: ids.count)

            for await (index, card) in group { slots[index] = card }

            return slots
        }

        var cards: [PendingReviewDuplicateOf.SimilarCard] = []
        var failed = 0

        for (index, card) in fetched.enumerated() {
            if let card {
                cards.append(card)
            } else if ids[index] == duplicate.bitId {
                cards.append(duplicate.similarCard)
            } else {
                failed += 1
            }
        }

        return DuplicateSimilarCards(cards: cards, failedCount: failed)
    }
}
