import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class ProgressInsightsModel {
    var rejectReasons: InsightState<RejectReasonsStatistics> = .loading
    var nothingExtracted: InsightState<NothingExtractedStatistics> = .loading
    var chatOutcomes: InsightState<ChatQueueOutcomesStatistics> = .loading

    func load() async {
        async let reasons = Self.state { try await APIClient.rejectReasonsStatistics() }
        async let nothing = Self.state { try await APIClient.nothingExtractedStatistics() }
        async let outcomes = Self.state { try await APIClient.chatQueueOutcomesStatistics() }
        let results = await (reasons, nothing, outcomes)

        rejectReasons = results.0
        nothingExtracted = results.1
        chatOutcomes = results.2
    }

    private static func state<T: Sendable>(_ call: @Sendable () async throws -> T) async -> InsightState<T> {
        do { return .ready(try await call()) } catch {
            if KnowledgeManageError.isCancellation(error) { return .loading }

            return .failed(ProgressLoadError.from(error)?.message ?? "Couldn't load this.")
        }
    }
}
