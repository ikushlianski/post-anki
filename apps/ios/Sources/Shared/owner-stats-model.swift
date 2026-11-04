import PostAnkiAPI
import SwiftUI

enum OwnerStatsRange: Int, CaseIterable, Identifiable {
    case week = 7
    case month = 30
    case quarter = 90

    var id: Int { rawValue }
    var label: String { "\(rawValue) days" }
}

@Observable
@MainActor
final class OwnerStatsModel {
    var range: OwnerStatsRange = .month
    var learning: OwnerLearningStats?
    var spend: OwnerAiSpend?
    var rejectReasons: RejectReasonsStatistics?
    var isLoading = false
    var failure: String?
    private var loadedOnce = false

    var env: String { learning?.env ?? spend?.env ?? "" }

    var monthSpendUsd: Double? {
        guard let spend else { return nil }

        let prefix = String(ISO8601DateFormatter().string(from: Date()).prefix(7))

        return spend.days.filter { $0.date.hasPrefix(prefix) }.reduce(0) { $0 + $1.totalUsd }
    }

    func loadIfNeeded() async {
        guard !loadedOnce else { return }

        await load()
    }

    func select(_ next: OwnerStatsRange) async {
        range = next
        await load()
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        let days = range.rawValue

        do {
            async let learningResult = APIClient.ownerLearningStats(days: days)
            async let spendResult = APIClient.ownerAiSpend(days: days)
            async let reasonsResult = try? APIClient.rejectReasonsStatistics()
            let (newLearning, newSpend) = try await (learningResult, spendResult)
            let newReasons = await reasonsResult

            guard days == range.rawValue else { return }

            learning = newLearning
            spend = newSpend
            rejectReasons = newReasons
            failure = nil
            loadedOnce = true
        } catch {
            if KnowledgeManageError.isCancellation(error) { return }

            failure = ConnectionFailureMessage.message(for: error, fallback: "Couldn't load statistics.")
        }
    }
}
