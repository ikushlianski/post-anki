import Foundation
import PostAnkiAPI

enum PendingReviewWindow {
    static let target = 20
    static let lowWater = 8
    static let topUpLimit = 50
    static let serverCap = 200

    static func needsTopUp(remaining: Int, exhausted: Bool, inFlight: Bool) -> Bool {
        !exhausted && !inFlight && remaining < lowWater
    }

    static func fetchLimit(known: Int) -> Int {
        min(serverCap, known + topUpLimit)
    }

    static func bitCount(_ sources: [PendingReviewSource]) -> Int {
        sources.reduce(0) { $0 + $1.bits.count }
    }

    static func cursor(after previous: PendingReviewCursor?, loaded: [PendingReviewSource]) -> PendingReviewCursor? {
        loaded.flatMap(\.bits).reduce(previous) { latest, bit in
            guard let createdAt = bit.createdAt else { return latest }

            let candidate = PendingReviewCursor(createdAt: createdAt, id: bit.id)

            guard let latest else { return candidate }

            return latest.isBefore(candidate) ? candidate : latest
        }
    }

    static func merge(
        held: [PendingReviewSource],
        incoming: [PendingReviewSource],
        excluded: Set<String>
    ) -> (sources: [PendingReviewSource], added: Int) {
        var seen = Set(held.flatMap { $0.bits.map(\.id) }).union(excluded)
        var merged = held
        var added = 0

        for source in incoming {
            let fresh = source.bits.filter { !seen.contains($0.id) }

            guard !fresh.isEmpty else { continue }

            seen.formUnion(fresh.map(\.id))
            added += fresh.count

            if let position = merged.firstIndex(where: { $0.id == source.id }) {
                merged[position] = merged[position].withBits(merged[position].bits + fresh)
            } else {
                merged.append(source.withBits(fresh))
            }
        }

        return (merged, added)
    }
}
