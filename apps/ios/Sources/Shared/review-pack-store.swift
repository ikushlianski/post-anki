import Foundation
import PostAnkiAPI

enum ReviewPackScope: Sendable, Equatable {
    case all
    case subject(String)
}

struct GradedSinceEntry: Codable, Sendable, Equatable {
    let variantId: String
    let bitId: String
    let at: Date
}

struct StoredReviewPack: Codable, Sendable {
    var serverURL: String
    var generatedAt: Date
    var dueBefore: String
    var truncated: Bool
    var cards: [ReviewPackCard]
    var gradedSince: [GradedSinceEntry]
}

struct OfflinePackCards: Sendable {
    let cards: [ReviewCard]
    let gradedVariantIds: Set<String>
    let gradedBitIds: Set<String>
    let generatedAt: Date
}

actor ReviewPackStore {
    static let shared = ReviewPackStore()

    static let gradedMarkLifetime: TimeInterval = 3600

    private let fileURLOverride: URL?

    init(fileURL: URL? = nil) {
        fileURLOverride = fileURL
    }

    private var fileURL: URL? {
        if let fileURLOverride { return fileURLOverride }

        return try? FileManager.default
            .url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("review-pack.json")
    }

    @discardableResult
    func replace(_ pack: ReviewPack, fetchStartedAt: Date) -> Bool {
        let cutoff = Date().addingTimeInterval(-Self.gradedMarkLifetime)
        let carried = (load()?.gradedSince ?? []).filter { $0.at > cutoff }
        let stored = StoredReviewPack(
            serverURL: ServerScope.current,
            generatedAt: Self.date(pack.generatedAt) ?? fetchStartedAt,
            dueBefore: pack.dueBefore,
            truncated: pack.truncated,
            cards: pack.cards,
            gradedSince: carried
        )

        return save(stored)
    }

    func cards(scope: ReviewPackScope) -> OfflinePackCards? {
        guard let stored = load(), stored.serverURL == ServerScope.current else {
            return nil
        }

        let packCards = stored.cards.filter { entry in
            switch scope {
            case .all: true
            case .subject(let id): entry.subjectId == id
            }
        }

        return OfflinePackCards(
            cards: packCards.map(\.card),
            gradedVariantIds: Set(stored.gradedSince.map(\.variantId)),
            gradedBitIds: Set(stored.gradedSince.map(\.bitId)),
            generatedAt: stored.generatedAt
        )
    }

    func alternates(forBitId bitId: String) -> [ReviewCard] {
        load()?.cards.first { $0.card.knowledgeBitId == bitId }?.alternates ?? []
    }

    func noteGraded(variantId: String, bitId: String, at: Date = Date()) {
        guard var stored = load() else { return }

        stored.gradedSince.removeAll { $0.variantId == variantId }
        stored.gradedSince.append(GradedSinceEntry(variantId: variantId, bitId: bitId, at: at))
        save(stored)
    }

    func unmarkGraded(variantId: String) {
        guard var stored = load() else { return }

        stored.gradedSince.removeAll { $0.variantId == variantId }
        save(stored)
    }

    func counts() -> ReviewCounts? {
        guard let offline = cards(scope: .all) else { return nil }

        return Self.counts(of: offline.cards.filter {
            !offline.gradedVariantIds.contains($0.variantId) && !offline.gradedBitIds.contains($0.knowledgeBitId)
        })
    }

    func clear() {
        if let url = fileURL { try? FileManager.default.removeItem(at: url) }
    }

    nonisolated static func counts(of cards: [ReviewCard]) -> ReviewCounts {
        ReviewCounts(
            new: cards.filter { $0.phase == "new" }.count,
            learning: cards.filter { $0.phase == "learning" || $0.phase == "relearning" }.count,
            review: cards.filter { $0.phase == "review" }.count
        )
    }

    nonisolated static func date(_ iso: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]

        return withFraction.date(from: iso) ?? plain.date(from: iso)
    }

    private func load() -> StoredReviewPack? {
        guard let fileURL, let data = try? Data(contentsOf: fileURL) else { return nil }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .millisecondsSince1970

        guard let stored = try? decoder.decode(StoredReviewPack.self, from: data) else {
            try? FileManager.default.removeItem(at: fileURL)

            return nil
        }

        return stored
    }

    @discardableResult
    private func save(_ stored: StoredReviewPack) -> Bool {
        guard var fileURL else { return false }

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .millisecondsSince1970

        guard let data = try? encoder.encode(stored), (try? data.write(to: fileURL, options: .atomic)) != nil else {
            return false
        }

        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? fileURL.setResourceValues(values)

        return true
    }
}
